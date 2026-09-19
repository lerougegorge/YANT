/** Day boundaries computed in the device's current local time zone (epoch ms, [start, end)). */
export function dayBounds(date: Date): { start: number; end: number } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return { start, end };
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The moment to log a new entry against, for a day chosen on the Home screen. A past or
 * future day has no natural "now", so it defaults to noon local time on that day; today
 * still gets the actual current time, unchanged from the previous behaviour.
 */
export function defaultLogTime(day: Date): Date {
  if (isSameDay(day, new Date())) return new Date();
  const d = new Date(day);
  d.setHours(12, 0, 0, 0);
  return d;
}
