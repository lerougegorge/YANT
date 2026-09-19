# Personal Nutrition Tracker — Specification

## Overview

A personal nutrition tracker built as a progressive web application. Its main selling points are that it is open source, makes use of AI for food analysis and label scans, uses OpenRouter to avoid any monthly fees (the user brings their own key and pays per call), and all records are stored locally on device (except AI API calls and barcode lookups, which are subject to those providers' data handling policies).

The design is mobile first and responsive. Simplicity. Short labels and descriptive icons wherever possible. The intended use case is installation as a homescreen icon.

### Principles

- **Local first.** The app is fully functional offline apart from AI calls and barcode lookups. No account, no server, no telemetry.
- **No recurring cost.** The only cost is the user's own OpenRouter usage. There is no backend to pay for.
- **Fast logging.** The common case — logging a food eaten before — should take two taps. AI is the fallback for unknown food, not the default path.
- **Text is the primary AI input.** A written description is often a better input than a photo, because the user knows the weights and the cooking method and the camera does not. Photos are an optional supplement.
- **Honest about uncertainty.** AI-derived figures are estimates and are labelled as such.
- **No image retention.** Photos are held in memory for the duration of an API call and then discarded. Nothing is ever written to storage.

### Non-goals (v1)

- Multi-user accounts, cloud sync, or sharing between devices (beyond manual export/import).
- Meal planning and shopping lists. Recipes *are* supported — see "Recipes and prepared dishes" — but as a natural consequence of AI text analysis, not as a separate structured feature with an ingredient database.
- Exercise tracking, weight tracking, or water tracking.
- A curated built-in food database. The user's own Food Items are the database, supplemented by Open Food Facts lookups for packaged goods.
- Storing or displaying photographs of food.

---

## Tech Stack

### Recommendation

- **Build:** Vite + TypeScript. Small, fast, no server component. Deployable as static files to any host (GitHub Pages, Netlify, Cloudflare Pages), which suits an open source project.
- **UI framework: React.** Pin the major version explicitly in `package.json` and state it at the top of any AI-assisted development brief, so generated code stays on one set of idioms.
- **PWA plumbing:** `vite-plugin-pwa` (wraps Workbox). Gives the manifest, service worker, precaching of the app shell, and an update prompt with very little configuration.
- **Styling:** Tailwind.
- **Routing:** React Router in hash mode, which avoids server rewrite configuration on static hosts.
- **Validation:** Zod, used for AI response parsing, Open Food Facts response parsing, and import file validation.
- **Charting:** uPlot. Tiny, fast, framework-agnostic; the Analysis screen needs bar charts and nothing exotic.

### Storage

**IndexedDB, wrapped by [Dexie.js](https://dexie.org/), with `dexie-react-hooks` for reads.**

Reasoning:

- `localStorage` is synchronous, string-only, capped at around 5 MB, and has no indexes. It is unsuitable as the primary store for a growing log of food instances.
- IndexedDB gives structured records, indexes (needed for "instances between two timestamps" and "food item by barcode"), and a quota in the hundreds of MB or more.
- Raw IndexedDB is unpleasant to use. Dexie is ~25 KB, gives a clean async API, and has a real schema versioning and migration system, which matters for an app that will gain fields over time.

**Data access pattern.** All component reads go through `useLiveQuery` from `dexie-react-hooks`. This is the single sanctioned pattern; there should be no `useEffect`-plus-`setState` data fetching anywhere in the codebase. A `useLiveQuery` result re-renders automatically whenever a write touches the queried tables, which is what makes the Home screen totals update the instant something is logged.

```ts
const instances = useLiveQuery(
  () => db.foodInstances.where('timestamp').between(dayStart, dayEnd).toArray(),
  [dayStart, dayEnd]
);
```

**Object stores:**

| Store | Key | Indexes |
|---|---|---|
| `foodItems` | `id` (uuid) | `description`, `barcode`, `updatedAt`, `lastUsedAt` |
| `foodInstances` | `id` (uuid) | `timestamp`, `foodItemId` |
| `goals` | `id` (uuid) | — |
| `meals` | `id` (uuid) | `sortOrder` |
| `settings` | fixed key `"singleton"` | — |

**Additional storage notes:**

- Call `navigator.storage.persist()` on first launch, ideally after the user has logged something so the permission prompt has context. Without persistent storage, browsers may evict IndexedDB under storage pressure. On iOS, data for a site not added to the home screen can be cleared after seven days of non-use — another reason to prompt for installation early.
- Keep a small mirror of boot-critical preferences (units, theme) in `localStorage` so the first paint doesn't wait on an async read. IndexedDB remains the source of truth.
- The OpenRouter key is stored in `settings`. It is same-origin and no worse protected than any other local data, but the settings screen should say plainly that anyone with access to the unlocked device can read it, and should link to OpenRouter's key management page so the user can set a spend limit.
- **Backup is a first-class feature, not a nice-to-have,** because there is no server copy. See "Export / Import".

### Browser APIs used

- **Camera / photos:** `<input type="file" accept="image/*" capture="environment">` for the take-or-choose picker. Most compatible route, no explicit permission handling. The resulting `File` is converted to base64 in memory and never persisted.
- **Live barcode scanning:** `getUserMedia` + `BarcodeDetector` where available (Chromium/Android). Fall back to `zxing-wasm` for iOS Safari and Firefox, which do not implement `BarcodeDetector`. Also support decoding from a still photo as a last resort.
- **Install:** capture `beforeinstallprompt` on Chromium for a custom install button; show text instructions for iOS Safari (Share → Add to Home Screen), which has no programmatic prompt.
- **Manifest:** `display: standalone`, `orientation: portrait`, maskable icons at 192/512, theme colour.

---

## Screens

Navigation is flat: Home is the root, everything else is pushed on top of it and dismissed with a back/close control. A bottom tab bar is deliberately avoided; the floating + is the only persistent affordance.

### Home Screen

Shows eating for the day with a table of items in chronological order, and totals for each column (see Preferences).

- **Header:** the date, with `<` and `>` chevrons to move a day at a time and a tap on the date to open a date picker. Horizontal swipe also changes day. A "Today" control appears when viewing any other day.
- **Grouping:** items are grouped under meal headings in meal order, with items having no meal placed in a trailing "Other" group. Within a group, items are in timestamp order.
- **Columns:** description (always shown) plus whichever numeric columns are enabled in Preferences. On narrow screens the table shows at most three numeric columns; excess columns are dropped from the right in the order listed in Preferences.
- **Totals:** a sticky total row per column at the bottom of the table. Per-meal subtotals shown in each meal heading row.
- **Goals:** above the table, a compact row of progress indicators, one per enabled goal, showing current value against target. A `>=` goal reads as progress toward the target; a `<=` goal reads as consumption of a budget and turns a warning colour when exceeded. Five a Day is shown as five discrete pips.
- **Row interactions:** tap opens the Edit Instance sheet. Swipe left reveals Delete (with undo toast). Long press offers "Duplicate to now" and "Save as Food Item" (the latter only if the instance did not come from one).
- **Empty state:** an illustration and a single line pointing at the + button.
- **A circular + button in the bottom right leads to the Add Screen.**

### Add Screen

- **Search field:** user types a description of food. The field takes focus and raises the keyboard on open.
- **Suggestions:** begins with food added around this time of day recently — look at the same four-hour window over the previous seven days and list up to five distinct foods, most frequent first, ties broken by most recent. As the user types, Food Items are searched (case-insensitive substring match on description, then fuzzy) and suggested. Recent-but-not-matching suggestions are dropped once the query is non-empty.
- **Suggestion rows** show description, serving description, and calories per serving. Tapping a row opens the **Log Sheet** rather than logging immediately, so amount and meal can be confirmed.
- **Three action buttons** below the suggestions:
  - **AI** — opens New Food from AI, carrying any typed text across as the starting description.
  - **Quick Add** — opens the Quick Add Screen.
  - **Search** — opens New Food from Search (barcode scan, or manual/Open Food Facts lookup).
- The AI button is labelled "AI" with a sparkle-style icon, **not** a camera, because a photo is optional and often unnecessary.
- **Trailing rows.** Whenever the query is non-empty, two rows follow whatever Food Item suggestions matched (even if some did): *"Quick add '<typed text>'"* and *"Search for '<typed text>'"*, carrying the text through as the starting description on the respective screen. These exist so a food that doesn't match anything logged before — a new packaged product, a new staple — is never a dead end at the search field itself.

### Log Sheet (shared component)

Used whenever an existing Food Item is being logged. A bottom sheet, not a full screen.

- Food description (read-only) and serving description.
- **Amount:** number input with `−` / `+` steppers, and a unit toggle offering **servings** or **grams** (or oz, per Preferences). The grams option is available only when the Food Item has per-100g data. Defaults to 1 serving. Accepts decimals.
- **Meal:** dropdown, defaulted by matching the current time against meal default start/end times. Falls back to no meal if nothing matches. See "Meal value resolution" for the orphaned-value case.
- **Time:** defaults to now; tappable to change, for logging something eaten earlier.
- Live preview of the resulting calories and macros.
- Action: **Log**.

### New Food from AI — Query

The screen opens on a two-way toggle — **Analyse food** / **Scan label** — defaulting to Analyse food. Photo analysis is the large majority of AI use, so this is a lightweight, always-visible toggle rather than a screen the user must answer before anything renders; nobody doing the common case sees any change from before the toggle existed. Switching to Scan label swaps the fields below for the label-scanning flow (below); it is not a third prompt or a merge of the two — see "Two call types" for why these stay separate.

**Analyse food** (default):

Text is the primary input; a photo is optional. Either alone is sufficient; both together give the best result.

- **Description field** — large, multi-line, focused on open, pre-filled with anything typed on the Add Screen. Placeholder text should teach by example, showing one of: *"two slices of funghi pizza, about 60g total"*, *"a flat white with oat milk from a coffee shop"*, *"roasted chicken thigh with skin, about 150g raw"*.
- **Photo (optional)** — a single button offering take-or-choose. Once attached, shows a thumbnail with a remove control. Only one photo; no gallery.
- **Helper text** under the photo button: *"Optional. Weights and cooking method in the description usually give a better estimate than a photo."*
- **AI model:** a single select, defaulting to the first entry in the ordered model list in Preferences. One model, one call. Additional opinions are gathered later, from the results screen, once there is something to be doubtful about. **The list is filtered to image-capable models when a photo is attached**; with text alone, any chat model is eligible, which is both cheaper and faster.
- **Action button: "Analyse".** Disabled while the description is empty and no photo is attached.
- **Before upload,** any image is downscaled client-side to a maximum 1024px on the longest edge and re-encoded as JPEG at quality 0.8. This reduces token cost and upload time with no meaningful loss of accuracy. The downscaled image exists only as an in-memory base64 string for the duration of the request.
- **Blocked states:** if no OpenRouter key is set, the button is disabled and a banner offers to open Settings. If offline, the button is disabled with an explanatory line.
- **In flight:** an inline progress state on the Analyse button. The screen is not replaced until a valid response arrives, so a failure has somewhere to return to.
- **Failure:** the screen stays where it is and shows an inline error box — *"Error: unusable response"* — with the underlying reason beneath it (no response, timed out, rate limited, response could not be read). The description, photo and model selection are all preserved untouched, so the user can edit the description, pick a different model, and press Analyse again. Nothing is lost and no separate recovery path is needed.

**Scan label:**

Reached via the toggle above. Resolves the open question of whether the AI path needs a barcode-free packaged-food route (a packaged item with a damaged or unreadable barcode has nowhere else to go for AI transcription) — see "Resolved Decisions".

- A photo is required; there is no text-only path, since there is nothing to transcribe without one. **Take photo** / **Upload photo** buttons, matching the Analyse food screen's visual weight.
- Calls Label Transcription (not Food Estimate) against the single **Default AI model for label transcription** from Preferences — no model picker, since label scanning is a transcription task with a correct answer.
- **Success** populates an editable form identical in shape to the New Food from Search form (description, serving description, per-serving macros, and per-100g/oz Advanced section) — the same "form, not a result card" principle as Analyse food. Actions: **Save & Log** / **Save only**, matching the Search screen. If an existing Food Item's description matches exactly, the user is asked whether to update it instead, as elsewhere.
- **Failure:** inline *"Error: unusable response"* box; the screen stays on the capture step, ready to retry.
- No second opinion flow — see "Two call types".

### New Food from AI — Results

**This screen is an editable form, not a result card.** The AI response populates the same input fields the user would otherwise have filled in by hand, and every one of them can be edited before anything is saved. There is no separate "accept" step and no manual-entry fallback screen, because the form *is* the manual-entry screen — it simply arrives pre-filled. This also makes it structurally identical to the Search screen's form (populated from Open Food Facts) and to the Scan label form under this same AI screen (populated from a label photo) — all three are the same editable form, arrived at by different routes.

**Always a single consolidated item, never a breakdown.** A photo of an airline tray returns one item — *"airline meal: pasta, roll and dessert"* — with combined totals. Multi-item decomposition is explicitly out of scope; if the user wants separate rows they run two analyses or edit the description.

**Primary fields** (always visible):

- **Description** — text field.
- **Serving description** — text field, e.g. "1 serving (300g)".
- **Amount control**, identical to the Log Sheet: servings or grams, defaulting to one serving as returned. This is what makes the recipe case work.
- **Calories per serving**, then **protein**, **carbohydrates**, **fat** and **fibre** per serving — number inputs.
- **Meal** dropdown, defaulted from the current time.

**Advanced section** (collapsed by default, expandable):

- Per 100g / oz values for calories and each macronutrient, with the same unit dropdown behaviour as the Search screen.
- Total prepared weight, servings, and weight per serving.
- **Processing group** (NOVA 1–4) segmented control.
- **Five a Day** checkbox.

Keeping the per-100g figures behind a toggle matters. Most of the time they are correct, derived, and of no interest, and putting ten more numbers on the first screen would make a two-tap flow feel like data entry. They stay one tap away for the recipe case, where they are the whole point.

**Estimate quality strip**, between the primary fields and the advanced section:

- Confidence, as returned.
- **Assumptions**, shown as plain text and not hidden behind a toggle. This is where an implausible number is usually explained — the model assumed thin crust, or a 300g portion, or that it was fried in oil.
- The name of the model that produced the estimate.
- **A "Second opinion" button.**

**Second opinion.** Pressing it calls the next model in the Preferences order that has not yet been used on this estimate, and merges the response into the current figures per "Combining results from multiple models". A small picker on the button allows choosing a specific model instead. It can be pressed repeatedly, each press adding one more contributing model, and it disappears once the list is exhausted.

The button exists so that cost is only incurred when there is doubt. The user has an estimate in front of them and can see whether it looks plausible; if 850 kcal for a bowl of soup looks wrong, a second opinion costs one more call, and if the first answer looks fine it costs nothing. Selecting models before seeing any result — the earlier design — spends money on confidence the user does not yet know they need.

**After a merge:**

- Fields whose value changed are briefly highlighted, so the user can see what the second model disagreed about.
- **Fields the user has already edited are locked and never overwritten.** Once a value is touched by hand it is treated as ground truth, excluded from the merge, and marked as edited. Overwriting a hand-corrected figure with a machine average would be the single most irritating behaviour this screen could have.
- The strip updates to read *"Combined from 2 models"*. Expanding it shows each contributing model's own figures side by side, with any model that failed listed with its error. From there the user can discard the consensus and take one model's response outright.
- **Disagreement is surfaced, not hidden.** When contributors diverge materially, the calorie field carries a range beneath it — *"models ranged 320–580 kcal"* — and confidence drops a step. A tight cluster is evidence the estimate is sound; a wide spread means the description was ambiguous, and the hint should say so.
- If a second opinion call fails, show an inline error on this screen and leave the existing figures untouched. A failed second opinion is a non-event, not a reason to lose the first one.

**Saving:**

- **Checkbox: "Add to Foods."** When checked, a Food Item is created. If an existing item's description matches exactly, the user is asked whether to update it instead.
- **Action: "Add".**

#### Recipes and prepared dishes

This screen is the recipe mechanism. No separate feature is needed.

A description like *"I made a pasta dish with 100g dry pasta, 200ml pomodoro sauce, 100g mixed veg and 20g parmesan; the prepared dish weighs 1500g and serves 5"* gives the model everything it needs to return whole-dish totals, a per-serving figure (300g), and per-100g values. The prompt must therefore ask explicitly for `totalWeightGrams` and `servings` alongside the nutrition figures, and must instruct the model to derive per-100g from the *prepared* weight rather than from the sum of the raw ingredients — this is the single most likely error, since cooking losses and water absorption change the total substantially.

Practical consequences:

- When the response includes a servings count greater than 1, the results screen shows a note: *"Recipe: 5 servings of about 300g"*, and the amount control defaults to one serving.
- "Add to Foods" on a recipe saves a Food Item with serving description *"1 serving (300g)"* and full per-100g data, so tomorrow's leftovers take two taps and an accurate gram weight — the leftover portion is rarely the same size as tonight's.
- Baked goods work the same way: *"I baked 24 cookies from 200g flour, 150g butter, 180g sugar and 2 eggs; total baked weight 900g"* yields a per-cookie figure.
- The original description is retained on the resulting Food Item in a `notes` field, so the recipe can be recalled and re-analysed later with adjustments.

### Quick Add Screen

- **Description** (optional — defaults to "Quick Add").
- **Calories.**
- Dropdown ("Advanced") section for macros + fibre + five-a-day + processing group.
- **Meal** and **time**, defaulted from the current time.
- Action: **Log**. Quick Add creates a Food Instance only; it never creates a Food Item.

### New Food from Search Screen

Reached via the **Search** button on the Add Screen (previously labelled "Barcode" — renamed because it is no longer only a barcode entry point; see "Resolved Decisions"). This screen is purely deterministic lookups plus manual entry — it makes no AI call. Label-photo transcription lives entirely under New Food from AI now (Scan label), so that the AI screen is the one place all AI-derived identification happens, and this screen never needs its own inline AI error/loading states.

The barcode lookup ladder runs cheapest-first. Each rung is tried only if the one above returns nothing.

1. **Local Food Items** — match on the `barcode` index. On a hit, skip everything and go straight to the Log Sheet. No network, no AI, no typing.
2. **Open Food Facts** — see "Open Food Facts integration" below. On a hit, populate the form and show a source line: *"From Open Food Facts"* with a link to the product page, since crowd-sourced data is sometimes wrong and the user should be able to check.
3. **Manual entry.**

A damaged or unreadable barcode, or a packaged item you'd rather not scan, falls through to manual entry here, or to AI (Analyse food from a description, or Scan label from a photo of the panel) as a separate path from the Add Screen.

**Text search of Open Food Facts by name is not implemented — see "Open Food Facts Integration" for why.** Until that's resolved, "Search for X" from the Add Screen lands on this screen with the description pre-filled for manual entry, rather than actually searching anything.

Screen contents:

- **Button to scan the barcode.** Opens a live camera view with a scan reticle where supported; falls back to a still photo. On successful decode, haptic feedback, the number populates the field, and the ladder above runs automatically.
- **Text of barcode (number)** with placeholder in italics: *"Please start by scanning a barcode"*. Also manually editable, for damaged or unreadable codes.
- **Description:** text field.
- **Serving description:** text field, default "1 serving". Barcode products usually state a serving on the pack, and Open Food Facts often supplies it.
- **Calories per serving:** number input.
- **Protein per serving:** number input (optional).
- **Fibre per serving:** number input (optional).
- **Fat per serving:** number input (optional).
- **Carbohydrates per serving:** number input (optional).

#### Advanced Inputs (toggle to expand down)

- The following allow inputs per 100g or oz. After the label (e.g. "Calories" or "Fibre"), a select/dropdown allows the user to select 100g or oz. The text input then follows. Changing one select will change those below it (but not above) to reduce work.
- Number inputs for calories, protein, fibre, carbohydrates, fat.
- **Processing group** (NOVA 1–4) — segmented control, see "Processing level" below.
- **Five a Day** (checkbox).
- Values entered in oz are converted and stored per 100g (1 oz = 28.3495 g). The display unit choice is remembered only for the duration of the screen.

Action: **Save & Log** (creates the Food Item and logs one serving), with a secondary **Save only**.

### Foods Screen (food item library)

- Searchable, alphabetical list of all Food Items, with calories per serving as the secondary line and a small badge for AI-estimated entries.
- Tap to edit; the edit form is the Search screen's form minus the scanning controls.
- Swipe to delete. Deleting a Food Item does **not** delete or alter past Food Instances, since instances store their own copies of the values. Warn about this once.
- Sort options: alphabetical, most used, recently added.
- Filter: all / AI-estimated / from barcode / manual.

### Analysis Screen

- **Range selector:** 7 days / 30 days / 90 days / custom.
- **Headline row:** average daily calories, average daily protein, and the number of days in range with any log at all, so averages can be read honestly.
- **Chart:** daily totals for one selected measurement over the range, as a bar chart, with the relevant goal drawn as a horizontal line.
- **Goal adherence:** for each enabled goal, the percentage of logged days meeting it, plus the current streak.
- **Composition:** macro split as a percentage of calories (protein ×4, carbs ×4, fat ×9 kcal/g), and calories by NOVA group as a stacked bar. The stacked bar is more informative than a single ultra-processed percentage, because it shows whether the non-UPF calories are whole foods or merely processed ones.
- **Five a Day:** count of days reaching five, as a small calendar heat strip.
- **Top foods:** most frequently logged Food Items in range, with total calories contributed.
- Days with no logged instances are excluded from averages but shown as gaps in the chart, never as zeroes.

### Settings Screen

Edits everything in the Preferences model, plus:

- **OpenRouter key** — masked input, a "Test key" button that calls `/api/v1/key` and reports the result, and a link to create a key.
- **Models** — "Refresh model list" fetches from OpenRouter; the list is filterable by name and shows per-million-token input/output price and whether the model accepts images. Chosen models form an ordered list, reorderable by drag: the first is used for the initial estimate, the rest are consumed in order by Second opinion. A separate single selection sets the label transcription model.
- **Open Food Facts** — a toggle to disable lookups entirely for users who would rather not make the request.
- **Export / Import** — see below.
- **About** — version, licence, repository link, Open Food Facts attribution, and a plain statement of what leaves the device: the description text and any photo go to OpenRouter and the routed provider when an analysis runs; barcodes go to Open Food Facts when a lookup runs; nothing else, ever. Photos are never stored.
- **Danger zone** — delete all data, with a typed confirmation.

---

## Data Model

Common fields on every record: `id` (UUID via `crypto.randomUUID()`), `createdAt`, `updatedAt` (both epoch milliseconds).

**Canonical units.** All values are stored in one canonical form regardless of display preference: energy in **kcal**, all nutrient masses in **grams**, per-100g figures always **per 100 grams**. Conversion to kJ (× 4.184) or oz (÷ 28.3495) happens at the display layer only. This avoids an entire class of bug where a preference change silently rewrites historical data.

### Processing level

Replaces the `ultraProcessed` boolean with `novaGroup`, an integer 1–4 or `null` for unknown, following the NOVA classification:

| Group | Meaning | Examples |
|---|---|---|
| 1 | Unprocessed or minimally processed | fruit, vegetables, plain meat, milk, dried pasta, frozen peas |
| 2 | Processed culinary ingredients | oil, butter, sugar, salt, honey |
| 3 | Processed foods | tofu, tinned beans, cheese, bread from a baker, cured meat |
| 4 | Ultra-processed | soft drinks, packaged snacks, most ready meals, reconstituted meat |

This gives both concepts the app needs from a single field, and resolves the tofu problem directly: tofu is group 3 — not a whole food, but not ultra-processed either, and without the health associations of group 4.

Derived properties used elsewhere:

- **Whole food** = group 1.
- **Ultra-processed** = group 4.

The UI presents it as a four-segment control with plain-English labels rather than numbers, since "NOVA 3" means nothing to most people. Unknown is a valid and common state and must not be presented as an error; leave it unset rather than guessing.

Open Food Facts returns `nova_group` directly, so barcode lookups populate this field free. The AI prompt asks for it explicitly with the definitions above included inline, since models are inconsistent about NOVA otherwise.

### Preferences

Single record.

- **Weight measurement units:** `"metric"` or `"oz"`.
- **Calorie measurement units:** `"cal"` or `"kJ"`.
- **Columns to display** (checkboxes, ordered): Calories (cal), Calories (kJ), Protein (g), Fibre (g), Carbohydrates (g), Fat (g). The food description is always shown.
- **List of available models** — cached from OpenRouter, each with `id`, `name`, `supportsImages`, `promptPrice`, `completionPrice`, `lastFetchedAt`.
- **Ordered model list for food estimates** — the first entry is used for the initial Analyse; subsequent entries are used in order by Second opinion. Reorderable by drag.
- **Default AI model for label transcription** — a single model; label scanning is a transcription task with a correct answer, so there is no second opinion flow.
- **List of meals.** A meal consists of a name, an optional default start time, an optional default end time, and a sort order.
- The initial meals are Breakfast (05:00–11:00), Lunch (11:00–14:00), Dinner (15:00–20:00), Snacks (no times).
- **OpenRouter key** (text string).
- **Open Food Facts lookups enabled** (boolean, default true).
- **Theme:** system / light / dark.
- **Schema version** — an integer, written on every save, used by Dexie migrations and by import validation.

**Meal time resolution.** Ranges may overlap or leave gaps (the defaults above leave 14:00–15:00 and 20:00–05:00 uncovered). Resolution rule: pick the first meal in sort order whose range contains the current time; if none does, pick no meal and let the user choose. A range whose end is before its start wraps past midnight. Meals with no times are never auto-selected.

**Meal value resolution (orphaned values).** Instances store the meal *name* as a string, so history is immune to later edits. Two cases follow:

- **Rename.** When a meal is renamed and past instances reference the old name, prompt: *"Also rename this meal in 47 past entries?"* with Yes / No. Yes runs a bulk update; No leaves history alone. This is the common case, and handling it here makes the second case rare.
- **Orphaned value in a dropdown.** If an instance's meal string is not in the current meal list — because the meal was deleted, or renamed with history left alone — the Edit Instance dropdown injects it as an extra preselected option labelled *"Breakfast (removed)"*, styled muted. It behaves normally if left alone and disappears from the list once the user selects something else. Without this, a plain `<select>` renders blank and silently rewrites the field on the next save.

### Goals

Goals consist of three fields: measurement, operator (`>=` or `<=`), value. All goals are evaluated per day.

- **Measurements:** calories, protein, fat, carbohydrates, fibre, percentage of calories from ultra-processed food (NOVA 4), percentage of calories from whole food (NOVA 1), five a day.
- **Five a Day** is a special goal where the operator is `>=` and the only value is 5.
- Each goal also has `enabled` (boolean) and `sortOrder`, so a goal can be switched off without losing it.
- At most one goal per measurement in v1.
- Calories from food with `novaGroup === null` are excluded from both the numerator and the denominator of the processing-percentage goals, and the goal display notes the excluded proportion when it exceeds 10% of the day's calories. Treating unknown as non-ultra-processed would flatter the number.

### Food Item

A food item is a durable (multi-use) record of food.

**Required**

- Description
- Serving description — default "1 serving", can be anything ("One item", "1 serving (300g)", "half a tin"), just for the user to know what they are inputting
- Calories per serving (kcal)

**Optional**

- Each macronutrient (protein, fat, carbohydrates) and fibre, per serving
- Calories per 100g
- Each macronutrient (protein, fat, carbohydrates) and fibre, per 100g
- `novaGroup` — integer 1–4 or null
- `fruitVeg` (true/false) — for five a day monitoring
- `barcode`
- `servingGrams` — the weight of one serving, when known. Required for the servings ↔ grams toggle to work.
- `servings` — for recipes, the number of servings the whole preparation yields
- `notes` — free text; for recipes, the original description given to the AI, so it can be recalled and re-analysed
- `source` — `"manual"`, `"ai-text"`, `"ai-photo"`, `"ai-label"`, or `"openfoodfacts"`
- `useCount` and `lastUsedAt`, maintained on log, used for suggestion ranking

Barcodes should be unique across Food Items. On saving a barcode that already exists, offer to open the existing item instead.

### Food Instance

A food instance is food logged at a particular time. All of these are primitive values; there is no required link to the underlying Food Item, but the item is used to copy data over.

- Timestamp
- Meal (optional) — stored as the meal **name string**, not an id
- Description
- Calories (kcal)
- Macros (protein, fat, carbohydrates), fibre
- `fruitVeg` (boolean), `novaGroup` (1–4 or null)
- `foodItemId` (optional) — a soft reference for "top foods" analysis and the "log again" flow. Never dereferenced for nutrition values.
- `amount`, `amountUnit` (`"servings"` or `"grams"`) and `servingDescription` — retained for display ("2 × 1 serving", "180 g") and so an instance can be edited proportionally after the fact
- `source` — as above

A Food Instance is fully self-contained. Editing or deleting a Food Item never changes an existing instance.

---

## AI Integration

### Transport

All calls go to `https://api.openrouter.ai/api/v1/chat/completions` directly from the browser with `Authorization: Bearer <key>`. OpenRouter permits browser-origin calls. Send `HTTP-Referer` and `X-Title` headers so usage is identifiable in the user's OpenRouter dashboard.

The model list comes from `GET /api/v1/models`, cached in Preferences and refreshed on demand, and automatically if older than 7 days.

### Two call types

There are exactly two prompts in the application:

| Call | Used by | Task |
|---|---|---|
| **Food Estimate** | New Food from AI | Estimation. Identify a food from a description, a photo, or both, and estimate its nutrition. |
| **Label Transcription** | New Food from AI (Scan label) | Transcription. Read the printed values off a nutrition panel. |

They are separate because the tasks are opposed. Estimation rewards a model for inferring what is not stated; transcription requires it to invent nothing. A single prompt trying to do both produces a model that quietly fills in gaps on a label photo, which is the worst possible failure — a fabricated number that looks authoritative because it came from a photograph of a package.

**Food Estimate branches client-side, not in the prompt.** The system prompt is a single constant. The user message is assembled in the client from whichever inputs exist:

- **Description only** — one text content block. Any chat model is eligible.
- **Photo only** — one image block plus a short fixed text block: *"Identify this food and estimate its nutrition."* Requires a vision model.
- **Both** — the image block followed by the description text. Requires a vision model.

The system prompt already covers all three cases, so no branching logic lives in the prompt itself. This matters for maintainability: there is one place to fix a prompt bug, not three.

### Request parameters

- `response_format: { type: "json_schema", json_schema: {...}, strict: true }` where the model supports it. Check `supported_parameters` on the model record from `/api/v1/models`; where structured output is unsupported, fall back to instruction-only JSON and strip code fences before parsing.
- `temperature: 0.2`. These are estimation tasks with a right-ish answer, not creative ones. Omit for models that reject the parameter.
- `max_tokens: 800`. The schema is small and a runaway response is pure cost.
- Always validate the parsed object with Zod. A schema violation is a model failure, handled exactly like a network failure.

### Response schema

```json
{
  "description": "string",
  "servingDescription": "string",
  "servings": 1,
  "totalWeightGrams": 0,
  "servingGrams": 0,
  "per100g":    { "calories": 0, "protein": 0, "fat": 0, "carbohydrates": 0, "fibre": 0 },
  "perServing": { "calories": 0, "protein": 0, "fat": 0, "carbohydrates": 0, "fibre": 0 },
  "novaGroup": 1,
  "fruitVeg": false,
  "confidence": "low | medium | high",
  "assumptions": "string"
}
```

Nutrient values are grams, calories are kcal. **Every numeric field is nullable.** A field the model cannot determine must be `null`, never zero — a zero is indistinguishable from real data once stored, and a fabricated zero for fibre will quietly drag a fibre goal down for months.

### Carbohydrate convention

**Carbohydrates exclude fibre.** This is the EU/UK labelling convention and is stated explicitly in both prompts.

It has to be stated because the conventions differ: a US Nutrition Facts panel lists *Total Carbohydrate* with fibre included, so transcribing a US label requires subtracting the fibre figure. The label prompt handles this by asking the model to identify which convention the panel uses and normalise accordingly, and to record what it did in `assumptions`. Without this, US and UK products in the same database are not comparable, and the carbohydrate column silently over-counts anything American.

---

## Combining results from multiple models

A single model is called on the first Analyse. Further models are added only when the user presses **Second opinion**, one at a time. The merge is therefore **incremental**: it runs again from scratch over the full set of responses gathered so far each time a new one arrives, rather than folding a new response into an already-merged figure. Recomputing from the raw set is both simpler and correct — folding a third response into an existing average would weight the first two wrongly.

Throughout, "contributing responses" means every valid response received on this estimate, including the first.

### Step 1 — Collect and validate

Each response is parsed and validated independently against the Zod schema. Discard any that fail validation, time out, or error, keeping the failure reason for display.

- **The first call fails** → the results screen is never shown. The query screen stays put and displays the inline *"Error: unusable response"* box, with inputs preserved.
- **A second opinion call fails** → the results screen keeps its current figures and shows an inline error. The failed model is marked as tried and skipped next time.
- **One valid response** → its values are used directly. No averaging, no spread indicator.
- **Two or more** → merge, as below.

### Step 2 — Normalise to per-100g before averaging anything

**Per-serving values must never be averaged directly.** Two models can produce identical, correct nutrition for the same food and still return per-serving figures that differ by a factor of two, simply because one assumed a 150g portion and the other a 300g one. Averaging those produces a figure describing a portion size that no model proposed.

So, for each valid response:

1. If `per100g` is present, use it.
2. If `per100g` is absent but `perServing` and `servingGrams` are both present, derive it: `perServing × 100 / servingGrams`.
3. If neither is possible, the response contributes to weight and categorical fields only, not to nutrition.

Averaging then happens entirely in per-100g space, which is portion-independent and therefore comparable across models.

### Step 3 — Exclude user-edited fields

Any field the user has edited by hand on the results screen is **locked**. It takes no part in the merge, is not overwritten, and is not counted in the spread calculation. The merge runs only over untouched fields.

This is why the merge recomputes from the raw response set rather than from the currently displayed values: the displayed value of an edited field is the user's, not a model's, and feeding it back in as though it were a model's estimate would give the user's own correction a vote against itself.

### Step 4 — Aggregate each numeric field independently

For each of the five per-100g nutrients, gather the values from responses that supplied a non-null number for **that specific field**. A model returning calories and protein but null fibre contributes to the first two averages and is simply absent from the third. Field counts will differ, and that is fine.

Aggregation rule, applied per field over the *n* contributing values:

- **n = 1** → that value.
- **n = 2** → the mean.
- **n ≥ 3** → the **median**.

The median rather than the mean at three or more is deliberate. Model failures in this task are not gently distributed; they are occasional order-of-magnitude errors — a decimal misplaced, a serving read as the whole dish. One such value moves a three-way mean by a third and moves the median not at all.

`servingGrams`, `totalWeightGrams` and `servings` are aggregated by the same rule, separately from the nutrients.

### Step 5 — Derive per-serving from the consensus

```
consensusPerServing = consensusPer100g × consensusServingGrams / 100
```

Never from the models' own per-serving figures. If no model supplied a usable `servingGrams`, leave per-serving values null, set `servingDescription` to "1 serving", and let the user enter the weight — the amount control handles grams directly, so the entry is still fully usable.

### Step 6 — Non-numeric fields

- **`novaGroup`** — mode (most frequently returned value) across responses that supplied one. On a tie, take the value from the earliest-called model. Never average: NOVA is an ordinal category, and the mean of groups 1 and 4 is not group 2.5, it is nonsense.
- **`fruitVeg`** — majority vote; tie broken by the earliest-called model.
- **`description` and `servingDescription`** — taken whole from the **representative model**, defined as the contributing model whose per-100g calorie value sits closest to the consensus. Descriptions cannot be averaged, and taking the one from the model that best matched the group avoids pairing a consensus number with the wording of the model that was furthest out. If the user has edited either field, it is locked and this step is skipped.
- **`assumptions`** — concatenated, each line prefixed with its model's short name. The user needs to see when one model assumed the pizza was thin crust and another did not; this is often the fastest explanation of why two estimates differ.
- **`confidence`** — the *lowest* confidence among contributing models, then downgraded one further step if the spread check fires. Consensus does not manufacture certainty.

### Step 7 — Quality checks on the merged result

Both checks warn; **neither silently rewrites a value.** The user is shown a number and told why it may be wrong, and can edit it — which then locks it.

**Spread check.** For per-100g calories, compute `(max − min) / median` across contributing models. Above 0.30, display the range beneath the calorie field and downgrade confidence one step. High spread nearly always means the description was ambiguous, so the accompanying hint should say so: *"Adding a weight or cooking method usually narrows this."*

**Internal consistency check.** Compare consensus calories against the Atwater estimate derived from the consensus macros:

```
atwater = (protein × 4) + (carbohydrates × 4) + (fat × 9) + (fibre × 2)
```

If `|atwater − consensusCalories| / consensusCalories > 0.15`, show an inline warning: *"Calories and macros don't quite agree — check before logging."* This is not a rare edge case. Averaging fields independently can break the arithmetic relationship between them even when every individual response was internally consistent, and the check exists precisely to catch that. It also fires on single-model results where the model itself was inconsistent, which is useful. Do not auto-correct by substituting the Atwater figure: the macros are as likely to be the wrong part as the calories, and a silently recomputed number would hide a bad estimate rather than expose it.

### Step 8 — Cost

Each second opinion is one more call at that model's rate. The button shows the estimated cost of the next call before it is pressed, and the quality strip shows the running total actually spent on this estimate from the `usage` objects. Because opinions are gathered one at a time and only on demand, the common case costs exactly one call, and the user only pays more when they have looked at a number and doubted it.



## Draft prompts

Drafts, to be tuned against real responses. Both should live in one module as exported constants, versioned with a comment, so that changing a prompt is a visible, reviewable diff.

### Food Estimate — system prompt

```
You are a nutrition estimation assistant. You will be given a text description of a food, a photograph of a food, or both. Identify the food and estimate its nutritional content as accurately as you can.

Respond with a single JSON object and nothing else. No preamble, no explanation, no markdown code fences.

RULES

1. Return ONE consolidated food item, even if the input contains several components. A plate with chicken, rice and salad is one item called something like "chicken with rice and salad", with combined totals. Never return a list or a breakdown.

2. Use null for anything you cannot determine. Never guess zero. Zero means "this food genuinely contains none of this nutrient" and will be stored as fact. If you do not know the fibre content, fibre is null, not 0.

3. Units are fixed: calories in kcal, all nutrients in grams, all weights in grams. Convert if the input uses other units.

4. Carbohydrates EXCLUDE fibre. Report them as separate figures that are not subsets of one another.

5. PREPARED WEIGHT. If the input describes a recipe or a dish made from ingredients, per-100g values must be derived from the weight of the FINISHED, PREPARED dish, not from the sum of the raw ingredient weights. Cooking changes weight substantially: pasta and rice absorb water and gain weight, meat and vegetables lose it. If the input states a prepared weight, use that number. If it does not, estimate the prepared weight and say so in "assumptions".

6. SERVINGS. If the input states how many servings the preparation yields, set "servings" to that number and set "servingGrams" to totalWeightGrams divided by servings. If no servings are stated, "servings" is 1 and the serving is the whole quantity described.

7. WEIGHTS IN THE TEXT WIN. If a photograph is provided alongside a description that states weights or quantities, treat the stated figures as correct and use the photograph only to identify what the food is and how it was prepared. The person had scales; you have pixels.

8. PROCESSING GROUP. Set "novaGroup" using the NOVA classification:
   1 = unprocessed or minimally processed (fresh, dried, frozen or cooked whole foods: fruit, vegetables, plain meat, fish, eggs, milk, dried pasta, plain rice, plain frozen vegetables)
   2 = processed culinary ingredients used to prepare group 1 foods (oil, butter, lard, sugar, salt, honey, vinegar)
   3 = processed foods, being group 1 foods with group 2 ingredients added, still recognisable as the original food (bread from a bakery, cheese, tinned beans or fish, tofu, cured meat, salted nuts, most home cooking)
   4 = ultra-processed formulations, typically industrially produced with ingredients not used in home kitchens such as protein isolates, hydrogenated oils, modified starches, emulsifiers, artificial flavourings or colourings (soft drinks, packaged snacks, mass-produced bread, most ready meals, reconstituted meat products, confectionery)
   A home-cooked dish is normally 1 or 3 depending on what went into it. If a described dish is made mostly from group 4 components, it is group 4. If you cannot tell, use null.

9. FRUIT AND VEG. Set "fruitVeg" true if the item would reasonably count toward a "five a day" fruit and vegetable target. Potatoes and other starchy staples do not count. Fruit juice counts at most once. A dish containing a meaningful vegetable portion counts.

10. CONFIDENCE. "high" only when the food is unambiguous and a weight or a standard portion is known. "medium" when the food is clear but the portion is inferred. "low" when the food itself is uncertain, when the photograph is unclear, or when you are relying on a broad category average.

11. ASSUMPTIONS. Use this field for anything that materially affects the numbers: an assumed portion weight, an assumed cooking method or fat used, an assumed brand or recipe, or which part of an ambiguous description you resolved and how. Be specific and brief. If you assumed nothing beyond the obvious, use an empty string.

OUTPUT SCHEMA

{
  "description": string,              // concise name for the food, as a person would write it in a food diary
  "servingDescription": string,       // human-readable serving, e.g. "1 slice", "1 serving (300g)", "1 medium apple"
  "servings": number,                 // servings the whole described quantity yields; 1 if not a recipe
  "totalWeightGrams": number | null,  // prepared weight of everything described
  "servingGrams": number | null,      // weight of one serving
  "per100g":    { "calories": number|null, "protein": number|null, "fat": number|null, "carbohydrates": number|null, "fibre": number|null },
  "perServing": { "calories": number|null, "protein": number|null, "fat": number|null, "carbohydrates": number|null, "fibre": number|null },
  "novaGroup": 1 | 2 | 3 | 4 | null,
  "fruitVeg": boolean,
  "confidence": "low" | "medium" | "high",
  "assumptions": string
}
```

**User message assembly (client-side):**

| Inputs | Content blocks |
|---|---|
| Description only | `[{ type: "text", text: <description> }]` |
| Photo only | `[{ type: "image_url", ... }, { type: "text", text: "Identify this food and estimate its nutrition." }]` |
| Both | `[{ type: "image_url", ... }, { type: "text", text: <description> }]` |

### Label Transcription — system prompt

```
You are transcribing a nutrition information panel from a photograph of food packaging. Your task is to READ the printed values. It is not to estimate them.

Respond with a single JSON object and nothing else. No preamble, no explanation, no markdown code fences.

RULES

1. TRANSCRIBE ONLY. Report only values that are printed on the panel and legible in the image. If a value is absent from the panel, unreadable, cut off or obscured, it is null. Never infer a value from your knowledge of similar products, and never calculate a missing value from the others. A null is useful; a plausible invention is harmful.

2. Units are fixed in the output: calories in kcal, all nutrients in grams, all weights in grams. Convert as needed. If energy is printed only in kilojoules, divide by 4.184 to get kcal and note this in "assumptions". If the panel uses ounces, convert to grams.

3. CARBOHYDRATES EXCLUDE FIBRE in the output. Panels differ, so determine which convention this one uses before reporting:
   - A panel listing "Carbohydrate" with "of which sugars" beneath it (typical UK and EU format) already excludes fibre. Report the printed figure as-is.
   - A panel listing "Total Carbohydrate" with "Dietary Fiber" indented beneath it (typical US format) INCLUDES fibre. Subtract the fibre figure from the carbohydrate figure and report the result.
   - State in "assumptions" which convention you identified and whether you subtracted.

4. PANEL COLUMNS. Many panels have both a per-100g column and a per-serving column. Read both and populate "per100g" and "perServing" accordingly. If only one column is printed, fill that one and leave the other null — do not compute the missing column yourself, the application will do that from the serving weight.

5. SERVING SIZE. Read the stated serving size into "servingDescription" exactly as printed, e.g. "30g (about 12 crisps)". Put its weight in grams into "servingGrams". If the panel states servings per container, put that in "servings"; otherwise use 1.

6. PRODUCT NAME. If the product name and brand are visible in the photograph, use them for "description". If only the panel is visible, use an empty string rather than guessing what the product is.

7. PROCESSING GROUP. If the ingredients list is legible, set "novaGroup" using the NOVA classification:
   1 = unprocessed or minimally processed, single-ingredient or nearly so
   2 = processed culinary ingredient (oil, sugar, salt, butter)
   3 = processed food, few ingredients, all of a kind found in a domestic kitchen
   4 = ultra-processed, containing ingredients not used in home cooking such as protein isolates, hydrogenated or interesterified oils, modified starches, maltodextrin, high-fructose syrups, emulsifiers, stabilisers, artificial or "natural" flavourings, colourings or sweeteners
   A long ingredients list containing any of the group 4 markers indicates group 4. If the ingredients list is not legible in the image, use null. Do not infer the group from the product name alone.

8. FRUIT AND VEG. Set "fruitVeg" true only if the product is substantially fruit or vegetable and would reasonably count toward a "five a day" target.

9. CONFIDENCE. "high" when the panel is sharp, complete and fully legible. "medium" when readable but partially obscured, angled or blurred. "low" when you are straining to read figures. If you cannot read the panel at all, return all nutrition values as null with confidence "low" and explain in "assumptions".

10. ASSUMPTIONS. Record any unit conversion performed, the carbohydrate convention identified, any figure you were unsure of, and anything illegible. This field is how the user knows which numbers to check.

OUTPUT SCHEMA

[identical to the Food Estimate schema]
```

**User message:** the label image, plus the fixed text *"Transcribe the nutrition panel in this image."* If a product description is already present on screen — from a prior attempt on this same item — append it as context: *"The product is described as: <description>."*

### Prompt maintenance notes

- Keep both prompts in one file with a version comment. When output quality changes, you need to know whether the prompt or the model changed.
- Build a small fixture set — ten or so descriptions and label photos with known correct answers, including at least one recipe with a stated prepared weight, one US-format label, and one deliberately ambiguous description — and re-run it after any prompt edit. Prompt regressions are silent otherwise.
- The rules most likely to need tuning in practice are 2 (null rather than zero, which models resist), 5 (prepared weight) and 3 in the label prompt (carbohydrate convention). Watch those first.

### Cost and errors

- Show a token/cost estimate after each call from the `usage` object in the response, and keep a running session tally visible in Settings.
- Handle explicitly: 401 (bad key → link to Settings), 402 (out of credit), 429 (rate limited → back off and offer retry), timeout after 60s, network offline.
- Never retry automatically more than once; each retry costs the user money.

---

## Open Food Facts Integration

**Access terms.** Read operations need no key and no account. They do require a custom `User-Agent` header identifying the application, in the form `AppName/Version (contact)`. The published rate limits are 15 requests per minute per IP for product reads and 10 per minute for search queries. Barcode lookups are single product reads at human speed, so the limit is not a practical constraint; the app should nevertheless fire lookups only for a completed barcode scan, and must never be wired to a search-as-you-type field.

**Endpoint.**

```
GET https://world.openfoodfacts.org/api/v2/product/{barcode}
    ?fields=product_name,brands,quantity,serving_size,serving_quantity,nutriments,nova_group,categories_tags
```

`status: 1` indicates a hit; `status: 0` means not found and should fall through to manual entry silently, not as an error.

**CORS verified from the browser.** This endpoint sends `Access-Control-Allow-Origin: *`, confirmed directly, so it works from a static PWA with no proxy as expected. **This does not extend to Open Food Facts' text-search APIs** — see Open Question #5 for a name-search endpoint that was checked the same way and found blocked.

**Field mapping to our Food Item:**

| Ours | Theirs | Notes |
|---|---|---|
| `description` | `product_name` + `brands` | Joined as "Brand — Product" when both present |
| `servingDescription` | `serving_size` | Free text, e.g. "30 g (about 12 crisps)" |
| `servingGrams` | `serving_quantity` | Numeric grams; frequently absent |
| calories per 100g | `nutriments["energy-kcal_100g"]` | Prefer the kcal field; fall back to `energy_100g` (kJ) ÷ 4.184 |
| protein / fat / carbs / fibre per 100g | `nutriments.proteins_100g` etc. | Already per 100g and in grams |
| per-serving values | `nutriments["*_serving"]` | Often absent; derive from per-100g × `servingGrams` ÷ 100 when missing |
| `novaGroup` | `nova_group` | Integer 1–4, or absent |
| `fruitVeg` | `categories_tags` | Heuristic only: set true if tags include a fruit or vegetable category. Present as a pre-ticked checkbox the user can correct, never as settled fact |
| `barcode` | `code` | |
| `source` | — | `"openfoodfacts"` |

**Storage.** Looked-up products are converted to our schema and saved as ordinary Food Items on first log. Nothing about the record remains foreign — the app has no notion of an external food. This means the second scan of the same product needs no network at all, and the user can permanently correct bad crowd-sourced data.

**Data quality.** Coverage is strong for European packaged goods and patchy elsewhere; individual records vary from complete to nearly empty. Two consequences: treat every field as optional and never assume a numeric field is present, and show a "not found or incomplete — add the label photo instead" path prominently rather than as a dead end. If `energy-kcal_100g` is missing and cannot be derived, the record is not usable and should be treated as a miss.

**Attribution.** Open Food Facts data is published under the Open Database License (ODbL). Since the app displays derived data, the About screen must credit Open Food Facts and link to the licence. Confirm the current requirements at their terms page before release rather than relying on this summary.

**Contributing back** is deliberately out of scope for v1: write operations need an account, and label-scan results are AI transcriptions that should not be pushed into a shared database unverified.

---

## Export / Import

Because there is no server copy, this is the only backup route and must be reliable.

- **Export:** a single JSON file containing schema version, export timestamp, and all five stores. The OpenRouter key is **excluded by default**, with a checkbox to include it. Filename `nutrition-export-YYYY-MM-DD.json`. Delivered via a download link / share sheet.
- **CSV export** of food instances as a secondary option, for spreadsheet use. One row per instance, canonical units, ISO 8601 timestamps.
- **Import:** validates schema version and shape with Zod, then offers **Merge** (records with unseen ids are added; matching ids are skipped) or **Replace** (wipe and restore). Replace requires a typed confirmation. Show a summary of what will change before committing.
- Prompt the user to export if they have never done so and have more than 30 days of data.

---

## Cross-cutting Details

- **Accessibility:** every icon-only control has an accessible label; tap targets are at least 44×44px; the app is usable at 200% text size; colour is never the only carrier of meaning (goal states and NOVA groups carry an icon or label as well as a colour).
- **Number inputs** use `inputmode="decimal"`, accept both `.` and `,` as the decimal separator, and are empty rather than `0` by default.
- **Time zones:** timestamps are stored as epoch ms; day boundaries are computed in the device's current local time zone. Historical days will shift if the user changes time zone; this is accepted and not corrected for.
- **Undo:** deletion of an instance shows a toast with Undo for 5 seconds. Deletion of a Food Item does not.
- **Offline:** the app shell and all data are available offline. AI and Open Food Facts features are disabled with a clear reason, not a silent failure.
- **Updates:** when a new service worker is waiting, show a non-blocking "Update available — reload" toast.
- **Rounding:** stored values keep full precision; display rounds calories to whole numbers and nutrients to one decimal place.

---

## Resolved Decisions

For the record, and to stop them being reopened during implementation:

1. **Multi-item photo analysis:** no. One analysis yields one consolidated item with combined totals.
2. **Open Food Facts:** yes, in v1, as rung 2 of the barcode ladder. No key required. Results are converted and stored in our own schema.
3. **Photo retention:** none. Images exist in memory for the duration of an API call and are never written to storage.
4. **Button labels:** "Analyse" on the AI query screen, "Add" on the results screen.
5. **Amount entry:** a servings/grams toggle everywhere food is logged, which also handles portions of a larger preparation.
6. **Processing level:** NOVA 1–4 replaces the ultra-processed boolean. Whole food = 1, ultra-processed = 4.
7. **Orphaned meal values:** prompt to migrate on rename; inject a muted "(removed)" option in the dropdown otherwise.
8. **Recipes:** supported through AI text analysis, not as a separate structured feature.
9. **Multiple models:** one model per Analyse. Further opinions are added on demand from the results screen, one at a time, and merged per-field over valid responses. Median at three or more contributors, mean at two. Individual responses remain inspectable.
10. **The results screen is an editable form**, pre-filled from the response, with per-100g and other detail behind an advanced toggle. There is no separate manual-entry fallback: hand-edited fields lock and are never overwritten by a later merge.
11. **AI failure handling:** an inline "Error: unusable response" box with the underlying reason, and the query screen retained with all inputs intact. No navigation away, nothing lost.
12. **Carbohydrates exclude fibre**, per EU/UK convention. US-format labels are normalised at transcription time.
13. **Two prompts only:** Food Estimate and Label Transcription. The estimate call branches client-side on which inputs are present.
14. **Label Transcription is reached from the AI screen, not the barcode/search screen** (resolves the barcode-free packaged-food question below): the New Food from AI screen opens on an Analyse food / Scan label toggle, defaulting to Analyse food since photo analysis is the large majority of AI use. This keeps every AI call behind one entry point and lets a packaged item with no usable barcode reach label transcription directly. The Barcode screen is renamed **Search** and left with only deterministic lookups (local Food Items, Open Food Facts by barcode) plus manual entry — no AI call of its own.
15. **Add screen trailing suggestions:** once the search query is non-empty, "Quick add '<query>'" and "Search for '<query>'" always follow whatever Food Item matches were found, not only when there were none. A food that doesn't match anything logged before should never be a dead end at the search field.

## Remaining Open Questions

1. **Should text-only analysis results be cached?** Analysing "flat white with oat milk" twice costs twice. A normalised-description cache would prevent that but risks serving a stale estimate when the user meant something slightly different. A middle path: before making the call, if a Food Item with a very similar description already exists, offer it and let the user skip the analysis.
2. **What should the default models be?** Cheap models handle text-only estimation adequately; photos need a capable vision model. Ship with a suggested pairing that is clearly labelled and easily changed, or force an explicit choice on first run? The former seems better than an empty state that blocks first use.
3. **Should the AI be given the user's recent Food Items as context** so it reuses their descriptions and stays consistent? Improves coherence, increases token cost on every call.
4. **Should a model that repeatedly falls outside consensus be demoted?** The app could track, per model, how often its per-100g calories land far from the median, and surface that in the model picker. Genuinely useful over months, but it is a new persisted statistic and a new screen, and it may be over-engineering for a personal tool.
5. **How should Open Food Facts text search be delivered, if at all?** Investigated for the Search screen and found blocked as specified: `search.openfoodfacts.org` (Search-a-licious, the API OFF's own docs recommend) does not send an `Access-Control-Allow-Origin` header, so a browser blocks reading its response from a static, backend-free PWA — confirmed directly (repeated requests came back with no CORS header, from any origin), not just suspected. The older name-search endpoint on the CORS-enabled `world.openfoodfacts.org` host works only intermittently — it returned valid, relevant results once in testing and a 503 "not available to anonymous users" on every following attempt — consistent with it being deprecated in OFF's own documentation. Barcode lookup is unaffected; only free-text search is blocked. Options, none yet chosen: (a) leave text search unbuilt and rely on barcode scan + the AI text flow, which already covers unbranded staples well; (b) add a minimal serverless proxy in front of Search-a-licious, which reintroduces a backend the project's "no backend to pay for" principle currently avoids; (c) route through a third-party public CORS relay, which adds an undisclosed data recipient the About screen's "nothing else, ever" data statement does not currently account for. Until resolved, the Add screen's "Search for X" suggestion opens the Search screen with the text pre-filled as a manual-entry description, not as a search.
