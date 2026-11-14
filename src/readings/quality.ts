import type { ReadingContext, ReadingMetric, ReadingQuality, ReadingSource } from './types';

export type ActivityState = 'resting' | 'active' | 'unknown';

export interface QualityInput {
  metric: ReadingMetric;
  source: ReadingSource;
  /** The simulation's own quality flag. */
  rawQuality: 'good' | 'poor' | 'missing' | 'excluded';
  /** A quality already assigned upstream (for example by replay). It wins. */
  explicit?: ReadingQuality | null;
  /** Wrist activity at the time of the reading, if known. */
  activity?: ActivityState;
  /** The upper-arm cuff was running on the same arm. */
  cuffInterference?: boolean;
  /** The sensor reported poor skin contact. */
  fitIssue?: boolean;
  context: ReadingContext;
}

/** Metrics that movement can disturb (optical pulse, skin temperature, cuff blood pressure). Glucose and sleep estimates are not labelled this way. */
const MOTION_SENSITIVE: ReadingMetric[] = ['heart_rate', 'hrv_rmssd', 'skin_temp', 'bp_systolic', 'bp_diastolic', 'spo2'];

/** True if the person was moving: wrist activity says so, or (when activity is unknown) they are standing and exercising right now. */
export function isMoving(activity: ActivityState | undefined, ctx: ReadingContext): boolean {
  if (activity === 'active') return true;
  if (activity === 'resting') return false;
  return ctx.posture === 'standing' && ctx.minutesSinceExercise !== null && ctx.minutesSinceExercise <= 2;
}

/**
 * Label a reading's quality. Readings are never hidden or dropped: they are labelled.
 *   poor_fit  the sensor reported poor skin contact
 *   motion    taken during movement, or while the cuff was inflating on the same arm
 *   unknown   no sensor assessment exists (manual entries, missing or excluded values)
 */
export function assessQuality(i: QualityInput): ReadingQuality {
  if (i.explicit) return i.explicit;
  if (i.fitIssue) return 'poor_fit';
  if (i.rawQuality === 'excluded' || i.rawQuality === 'missing') return 'unknown';
  if (i.cuffInterference) return 'motion';
  if (MOTION_SENSITIVE.includes(i.metric) && isMoving(i.activity, i.context)) return 'motion';
  if (i.source === 'manual') return 'unknown';
  return 'good';
}
