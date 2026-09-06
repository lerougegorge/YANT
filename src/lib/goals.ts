import type { FoodInstance, Goal, GoalMeasurement } from '../db/types';

export interface GoalEvaluation {
  goal: Goal;
  current: number;
  target: number;
  met: boolean;
  excludedPercent: number | null; // for the two processing-percentage measurements
}

function sum(instances: FoodInstance[], pick: (i: FoodInstance) => number | null): number {
  return instances.reduce((acc, i) => acc + (pick(i) ?? 0), 0);
}

export function currentValueForMeasurement(measurement: GoalMeasurement, instances: FoodInstance[]): { value: number; excludedPercent: number | null } {
  switch (measurement) {
    case 'calories':
      return { value: sum(instances, (i) => i.calories), excludedPercent: null };
    case 'protein':
      return { value: sum(instances, (i) => i.protein), excludedPercent: null };
    case 'fat':
      return { value: sum(instances, (i) => i.fat), excludedPercent: null };
    case 'carbohydrates':
      return { value: sum(instances, (i) => i.carbohydrates), excludedPercent: null };
    case 'fibre':
      return { value: sum(instances, (i) => i.fibre), excludedPercent: null };
    case 'fiveADay':
      return { value: instances.filter((i) => i.fruitVeg).length, excludedPercent: null };
    case 'nova4Percent':
    case 'nova1Percent': {
      const totalCalories = sum(instances, (i) => i.calories);
      const known = instances.filter((i) => i.novaGroup !== null);
      const knownCalories = sum(known, (i) => i.calories);
      const targetGroup = measurement === 'nova4Percent' ? 4 : 1;
      const groupCalories = sum(
        known.filter((i) => i.novaGroup === targetGroup),
        (i) => i.calories
      );
      const value = knownCalories > 0 ? (groupCalories / knownCalories) * 100 : 0;
      const excludedCalories = totalCalories - knownCalories;
      const excludedPercent = totalCalories > 0 ? (excludedCalories / totalCalories) * 100 : 0;
      return { value, excludedPercent };
    }
  }
}

export function evaluateGoal(goal: Goal, instances: FoodInstance[]): GoalEvaluation {
  const { value, excludedPercent } = currentValueForMeasurement(goal.measurement, instances);
  const met = goal.operator === '>=' ? value >= goal.value : value <= goal.value;
  return { goal, current: value, target: goal.value, met, excludedPercent };
}

export const GOAL_MEASUREMENT_LABELS: Record<GoalMeasurement, string> = {
  calories: 'Calories',
  protein: 'Protein',
  fat: 'Fat',
  carbohydrates: 'Carbohydrates',
  fibre: 'Fibre',
  nova4Percent: '% ultra-processed (NOVA 4)',
  nova1Percent: '% whole food (NOVA 1)',
  fiveADay: 'Five a Day'
};
