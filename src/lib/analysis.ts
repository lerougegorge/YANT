import { db } from '../db/db';
import type { FoodInstance, Goal } from '../db/types';
import { dayBounds, addDays } from './date';
import { computeTotals, type Totals } from './grouping';
import { evaluateGoal } from './goals';

export interface DayEntry {
  date: Date;
  totals: Totals;
  hasLog: boolean;
  fruitVegCount: number;
  instances: FoodInstance[];
}

export async function computeDailySeries(rangeStart: Date, rangeEnd: Date): Promise<DayEntry[]> {
  const { start } = dayBounds(rangeStart);
  const { end } = dayBounds(rangeEnd);
  const all = await db.foodInstances.where('timestamp').between(start, end, true, false).toArray();

  const days: DayEntry[] = [];
  let cursor = new Date(rangeStart);
  while (dayBounds(cursor).start < end) {
    const { start: dStart, end: dEnd } = dayBounds(cursor);
    const dayInstances = all.filter((i) => i.timestamp >= dStart && i.timestamp < dEnd);
    days.push({
      date: new Date(cursor),
      totals: computeTotals(dayInstances),
      hasLog: dayInstances.length > 0,
      fruitVegCount: dayInstances.filter((i) => i.fruitVeg).length,
      instances: dayInstances
    });
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function headlineStats(days: DayEntry[]): { avgCalories: number; avgProtein: number; daysLogged: number } {
  const logged = days.filter((d) => d.hasLog);
  if (logged.length === 0) return { avgCalories: 0, avgProtein: 0, daysLogged: 0 };
  const avgCalories = logged.reduce((a, d) => a + d.totals.calories, 0) / logged.length;
  const avgProtein = logged.reduce((a, d) => a + d.totals.protein, 0) / logged.length;
  return { avgCalories, avgProtein, daysLogged: logged.length };
}

export interface GoalAdherence {
  goal: Goal;
  percentMet: number;
  streak: number;
}

export function computeGoalAdherence(goal: Goal, days: DayEntry[]): GoalAdherence {
  const logged = days.filter((d) => d.hasLog);
  const metFlags = logged.map((d) => evaluateGoal(goal, d.instances).met);
  const percentMet = metFlags.length > 0 ? (metFlags.filter(Boolean).length / metFlags.length) * 100 : 0;

  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (!d.hasLog) break;
    if (evaluateGoal(goal, d.instances).met) streak++;
    else break;
  }
  return { goal, percentMet, streak };
}

export function macroComposition(days: DayEntry[]): { protein: number; carbohydrates: number; fat: number } {
  const totals = days.reduce(
    (acc, d) => ({
      protein: acc.protein + d.totals.protein,
      carbohydrates: acc.carbohydrates + d.totals.carbohydrates,
      fat: acc.fat + d.totals.fat
    }),
    { protein: 0, carbohydrates: 0, fat: 0 }
  );
  const proteinKcal = totals.protein * 4;
  const carbsKcal = totals.carbohydrates * 4;
  const fatKcal = totals.fat * 9;
  const totalKcal = proteinKcal + carbsKcal + fatKcal;
  if (totalKcal === 0) return { protein: 0, carbohydrates: 0, fat: 0 };
  return {
    protein: (proteinKcal / totalKcal) * 100,
    carbohydrates: (carbsKcal / totalKcal) * 100,
    fat: (fatKcal / totalKcal) * 100
  };
}

export function novaCalorieBreakdown(days: DayEntry[]): Record<'1' | '2' | '3' | '4' | 'unknown', number> {
  const out = { '1': 0, '2': 0, '3': 0, '4': 0, unknown: 0 };
  for (const day of days) {
    for (const instance of day.instances) {
      const key = instance.novaGroup === null ? 'unknown' : (String(instance.novaGroup) as '1' | '2' | '3' | '4');
      out[key] += instance.calories;
    }
  }
  return out;
}

export interface TopFood {
  key: string;
  description: string;
  totalCalories: number;
  count: number;
}

export function topFoods(days: DayEntry[], limit = 8): TopFood[] {
  const byKey = new Map<string, TopFood>();
  for (const day of days) {
    for (const instance of day.instances) {
      const key = instance.foodItemId ?? `desc:${instance.description.toLowerCase()}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.totalCalories += instance.calories;
        existing.count += 1;
      } else {
        byKey.set(key, { key, description: instance.description, totalCalories: instance.calories, count: 1 });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.totalCalories - a.totalCalories).slice(0, limit);
}
