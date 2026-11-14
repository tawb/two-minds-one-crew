// Short, rule-based recommendations that depend on the reading, where it sits against its range, and its context.
// Normal readings get none. No diagnosis and no cause is stated. All wording is PLACEHOLDER text,
// TODO(flight-surgeon): replace with approved wording.

import { READINGS_CONFIG } from './config';
import type { Position } from './baseline';
import type { ReadingCalibration, ReadingContext, ReadingMetric, ReadingQuality } from './types';

export type SuggestTone = 'ok' | 'high' | 'low' | 'info';

export interface Suggestion {
  /** Coloured tag: Normal, High, Low; null when there is no range to compare with. */
  tag: 'Normal' | 'High' | 'Low' | null;
  tone: SuggestTone;
  /** Short lines for the card, most important first. Empty for a normal reading with nothing to caveat. */
  lines: string[];
  /** One short instruction for the "What to do now" list. null unless the reading is out of range. */
  action: string | null;
}

export interface SuggestInput {
  metric: ReadingMetric;
  position: Position;
  quality: ReadingQuality;
  calibration: ReadingCalibration;
  context: ReadingContext;
}

const isBp = (m: ReadingMetric) => m === 'bp_systolic' || m === 'bp_diastolic';

export function suggest(i: SuggestInput): Suggestion {
  const { metric, position, quality, calibration, context: c } = i;
  const lines: string[] = [];
  const exMax = READINGS_CONFIG.context.postExerciseMaxMinutes;
  const afterExercise = c.minutesSinceExercise !== null && c.minutesSinceExercise <= exMax;
  const afterMeal = c.minutesSinceMeal !== null && c.minutesSinceMeal <= 120;
  const standing = c.posture === 'standing';

  // 1. Is the number itself trustworthy? Say so first.
  if (quality === 'poor_fit') lines.push('Poor sensor contact. Adjust the band or patch and measure again.');
  if (quality === 'motion') lines.push('Taken while moving. Sit still for a minute and measure again.');
  if (isBp(metric) && calibration.state === 'stale') lines.push('The cuff needs calibration. Treat this number as approximate.');
  if (isBp(metric) && calibration.state === 'calibrating') lines.push('The cuff has not been calibrated yet. Treat this number as approximate.');

  // 2. Out of range: what to do, using context. A normal reading gets no recommendation.
  const hasRange = position !== 'unknown';
  let action: string | null = null;
  if (position === 'above' || position === 'below') {
    const up = position === 'above';
    if (metric === 'heart_rate') {
      if (up) {
        lines.push(afterExercise ? 'A raised pulse is expected soon after exercise. Rest seated for 10 minutes, then measure again.'
          : standing ? 'Sit down and rest for 5 minutes, then measure again.'
          : 'Sit and rest for 5 minutes, breathe slowly, drink some water, then measure again. Tell the flight surgeon if it stays high or you feel unwell.');
        action = afterExercise ? 'Rest seated for 10 minutes, then measure again.' : 'Sit and rest, breathe slowly and drink some water.';
      } else {
        lines.push('If you feel dizzy or faint, lie down and tell the flight surgeon. Otherwise rest and measure again in a few minutes.');
        action = 'Rest, and lie down if you feel dizzy. Measure again in a few minutes.';
      }
    } else if (isBp(metric)) {
      if (up) {
        lines.push(afterExercise ? 'Blood pressure is often higher soon after exercise. Sit and rest for 10 minutes, then measure again.'
          : standing ? 'Sit down and rest for 5 minutes, then measure again.'
          : 'Sit and rest for 5 minutes, breathe slowly, then measure again. Tell the flight surgeon if it stays high.');
        action = 'Sit and rest for 5 minutes, breathe slowly, then measure again.';
      } else {
        lines.push(standing ? 'Sit or lie down, drink some water and measure again. Stand up slowly. Tell the flight surgeon if you feel dizzy.'
          : 'Lie down or sit, drink some water, then measure again. Tell the flight surgeon if you feel dizzy.');
        action = 'Sit or lie down, drink some water and stand up slowly.';
      }
    } else if (metric === 'glucose') {
      if (up) {
        lines.push(afterMeal ? 'A rise after a meal is common. A short walk helps. Measure again in an hour.'
          : 'Drink some water and take a short walk, then check again in 30 minutes. Tell the flight surgeon if it stays high.');
        action = 'Drink some water and take a short walk, then check again in 30 minutes.';
      } else {
        lines.push(afterExercise ? 'Low soon after exercise. Rest and eat something (a planned snack or drink), then check again in 15 minutes. Tell the flight surgeon if you feel shaky.'
          : 'Eat something (a planned snack or drink), then check again in 15 minutes. Tell the flight surgeon if you feel shaky or unwell.');
        action = 'Eat something (a planned snack or drink), then check again in 15 minutes.';
      }
    } else if (metric === 'sleep') {
      lines.push('You slept less than usual. Rest today and plan an early night.');
      action = 'Rest today and plan an early night.';
    } else if (metric === 'skin_temp') {
      lines.push('Skin temperature is high. Rest, drink some water and cool down, then measure again.');
      action = 'Rest, drink some water and cool down, then measure again.';
    }
  }

  const tag = !hasRange ? null : position === 'within' ? 'Normal' : position === 'above' ? 'High' : 'Low';
  const tone: SuggestTone = tag === 'Normal' ? 'ok' : tag === 'High' ? 'high' : tag === 'Low' ? 'low' : 'info';
  return { tag, tone, lines, action };
}

/** The worst of several positions, for blood pressure (systolic and diastolic). */
export function worstPosition(ps: Position[]): Position {
  return ps.includes('above') ? 'above' : ps.includes('below') ? 'below' : ps.includes('within') ? 'within' : 'unknown';
}
