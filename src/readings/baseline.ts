// Personal baselines: median and MAD per metric and context, used only after enough personal sessions.
// A "session" is one Measure vitals tap (or one replayed recording segment). Everything here is descriptive, never advice.

import { READINGS_CONFIG } from './config';
import { referenceFor, type AgingReference, type RefMetric, type RefRange, type Sex } from './reference';
import type { Reading, ReadingContext, ReadingMetric } from './types';

export type Bucket = 'resting_seated' | 'after_exercise' | 'other' | 'unknown';

export const BUCKET_LABEL: Record<Bucket, string> = {
  resting_seated: 'resting, seated', after_exercise: 'after exercise', other: 'other situations', unknown: 'situation unknown',
};

/**
 * Which situation a reading was taken in. Posture or exercise timing unknown -> "unknown" (still shown, never hidden).
 * The cut-offs are configuration, TODO(flight-surgeon).
 */
export function contextBucket(c: ReadingContext, cfg = READINGS_CONFIG.context): Bucket {
  if (c.minutesSinceExercise === null || c.posture === 'unknown') return 'unknown';
  if (c.minutesSinceExercise <= cfg.postExerciseMaxMinutes) return 'after_exercise';
  if (c.posture === 'seated' && c.minutesSinceExercise >= cfg.restingMinMinutesSinceExercise) return 'resting_seated';
  return 'other';
}

export const median = (v: number[]): number => {
  const a = [...v].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
/** Median absolute deviation. */
export const mad = (v: number[], med = median(v)): number => median(v.map((x) => Math.abs(x - med)));

export interface SessionReading { reading: Reading; session: string | null }
export interface SessionValue { session: string; value: number }

/** One value per session (the median of that session's good-quality readings) for a metric and situation. */
export function sessionValues(items: SessionReading[], metric: ReadingMetric, bucket: Bucket): SessionValue[] {
  const by = new Map<string, number[]>();
  for (const { reading: r, session } of items) {
    if (r.metric !== metric || !session || r.quality !== 'good' || typeof r.value !== 'number') continue;
    if (contextBucket(r.context) !== bucket) continue;
    const a = by.get(session) ?? [];
    a.push(r.value);
    by.set(session, a);
  }
  return [...by.entries()].map(([session, v]) => ({ session, value: median(v) }));
}

export interface PersonalBaseline { n: number; median: number; mad: number; low: number; high: number }

/** Median +/- k x scaled MAD, with a floor on the spread so a very steady history does not give a razor-thin range. */
export function personalBaseline(values: number[], cfg = READINGS_CONFIG.baseline): PersonalBaseline | null {
  if (!values.length) return null;
  const med = median(values);
  const spread = Math.max(cfg.madScale * mad(values, med), Math.abs(med) * cfg.minRelMad);
  return { n: values.length, median: med, mad: mad(values, med), low: med - cfg.rangeK * spread, high: med + cfg.rangeK * spread };
}

export type RangeMode = 'personal' | 'population' | 'none';
export type Position = 'within' | 'above' | 'below' | 'unknown';

export interface ResolvedRange {
  mode: RangeMode;
  bucket: Bucket;
  /** Sessions counted for this metric and situation. */
  sessions: number;
  needed: number;
  low: number | null;
  high: number | null;
  unit: string;
  /** "using population reference" or "using your baseline (N sessions)". */
  label: string;
  detail: string;
  position: Position;
}

const REF_FOR: Partial<Record<ReadingMetric, (b: Bucket) => RefMetric | null>> = {
  heart_rate: (b) => (b === 'resting_seated' ? 'resting_hr' : null), // the reference describes resting heart rate only
  bp_systolic: () => 'bp_systolic',
  bp_diastolic: () => 'bp_diastolic',
  glucose: () => 'glucose',
  sleep: () => 'sleep',
  skin_temp: () => 'skin_temp',
};

export interface ResolveInput {
  metric: ReadingMetric;
  value: number | null;
  bucket: Bucket;
  items: SessionReading[];
  age: number | null;
  sex: Sex | null;
  aging?: AgingReference | null;
  minSessions?: number;
}

const positionOf = (v: number | null, lo: number | null, hi: number | null): Position => (v === null || lo === null || hi === null ? 'unknown' : v < lo ? 'below' : v > hi ? 'above' : 'within');

/**
 * Pick the range to compare a reading against: the population reference until the person has `minSessions` sessions
 * in the same situation, then their own median-and-MAD baseline.
 */
export function resolveRange(i: ResolveInput): ResolvedRange {
  const needed = i.minSessions ?? READINGS_CONFIG.baseline.minSessions;
  const vals = sessionValues(i.items, i.metric, i.bucket).map((s) => s.value);
  const base = { bucket: i.bucket, sessions: vals.length, needed };
  const bl = vals.length >= needed ? personalBaseline(vals) : null;
  if (bl) {
    return {
      ...base, mode: 'personal', low: bl.low, high: bl.high, unit: '', label: `using your baseline (${bl.n} sessions)`,
      detail: `${BUCKET_LABEL[i.bucket]}: median ${bl.median.toFixed(0)}, range ${bl.low.toFixed(0)} to ${bl.high.toFixed(0)}`,
      position: positionOf(i.value, bl.low, bl.high),
    };
  }
  const rm = REF_FOR[i.metric]?.(i.bucket) ?? null;
  if (!rm) {
    return { ...base, mode: 'none', low: null, high: null, unit: '', label: 'no reference for this situation', detail: `${vals.length} of ${needed} sessions so far (${BUCKET_LABEL[i.bucket]})`, position: 'unknown' };
  }
  const ref: RefRange = referenceFor(rm, i.age, i.sex, i.aging);
  return {
    ...base, mode: 'population', low: ref.low, high: ref.high, unit: ref.unit, label: 'using population reference',
    detail: `${ref.label}: ${ref.low} to ${ref.high} ${ref.unit}. ${vals.length} of ${needed} sessions so far (${BUCKET_LABEL[i.bucket]}).`,
    position: positionOf(i.value, ref.low, ref.high),
  };
}
