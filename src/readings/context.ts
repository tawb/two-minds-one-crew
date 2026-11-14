import type { ContextInput, ReadingContext, ReadingMetric, StoredContext } from './types';

export const emptyInput = (): ContextInput => ({ posture: 'unknown', exerciseAt: null, mealAt: null, sleepHours: null, notes: null });

/**
 * Combine what the astronaut entered with what the simulator's schedule knows. The astronaut's fields always win; a
 * field that is still unknown falls back to the simulator (simulated readings only). Missing fields stay missing.
 */
export function mergeContext(user: ContextInput | undefined, sim: StoredContext | null): StoredContext {
  const u = user ?? emptyInput();
  const out: StoredContext = {
    posture: u.posture !== 'unknown' ? u.posture : sim?.posture ?? 'unknown',
    exerciseAt: u.exerciseAt ?? sim?.exerciseAt ?? null,
    mealAt: u.mealAt ?? sim?.mealAt ?? null,
    sleepHours: u.sleepHours ?? sim?.sleepHours ?? null,
    notes: u.notes ?? null,
  };
  const fromSim = !!sim && (
    (u.posture === 'unknown' && sim.posture !== 'unknown') || (u.exerciseAt === null && sim.exerciseAt !== null)
    || (u.mealAt === null && sim.mealAt !== null) || (u.sleepHours === null && sim.sleepHours !== null)
  );
  if (fromSim) { out.derived = true; out.notes = out.notes ?? 'context from the simulator schedule'; }
  return out;
}

const minutes = (atMs: number, readingMs: number) => Math.max(0, Math.round((readingMs - atMs) / 60_000));

/** Stored (absolute) context -> the reading's context at the moment of the reading. */
export function toReadingContext(c: StoredContext | undefined, readingMs: number): ReadingContext {
  if (!c) return { posture: 'unknown', minutesSinceExercise: null, minutesSinceMeal: null, sleepLastNightHours: null, notes: null };
  return {
    posture: c.posture,
    minutesSinceExercise: c.exerciseAt === null ? null : minutes(c.exerciseAt, readingMs),
    minutesSinceMeal: c.mealAt === null ? null : minutes(c.mealAt, readingMs),
    sleepLastNightHours: c.sleepHours,
    notes: c.notes,
  };
}

export type ContextField = 'posture' | 'exercise' | 'meal' | 'sleep';

/** Which context fields matter for interpreting each metric. Missing ones are labelled, never blocking. */
export function requiredContext(metric: ReadingMetric): ContextField[] {
  switch (metric) {
    case 'heart_rate': case 'hrv_rmssd': case 'bp_systolic': case 'bp_diastolic': case 'skin_temp': return ['posture', 'exercise'];
    case 'glucose': return ['meal', 'exercise'];
    case 'response_ms': return ['sleep'];
    default: return [];
  }
}

export function missingContext(ctx: ReadingContext, metric: ReadingMetric): ContextField[] {
  return requiredContext(metric).filter((f) => {
    if (f === 'posture') return ctx.posture === 'unknown';
    if (f === 'exercise') return ctx.minutesSinceExercise === null;
    if (f === 'meal') return ctx.minutesSinceMeal === null;
    return ctx.sleepLastNightHours === null;
  });
}

/** Presets for the context panel (minutes ago, or null for unknown). The label is shown, the minutes are stored. */
export const AGO_PRESETS: { label: string; minutes: number | null }[] = [
  { label: 'Unknown', minutes: null },
  { label: 'Within 30 min', minutes: 15 },
  { label: '30 to 90 min ago', minutes: 60 },
  { label: '1.5 to 4 h ago', minutes: 150 },
  { label: '4 to 12 h ago', minutes: 480 },
  { label: 'More than 12 h ago', minutes: 900 },
];

/** Which preset an absolute time currently falls into (for showing the current choice). */
export function presetIndexFor(at: number | null, nowMs: number): number {
  if (at === null) return 0;
  const m = (nowMs - at) / 60_000;
  if (m < 30) return 1;
  if (m < 90) return 2;
  if (m < 240) return 3;
  if (m < 720) return 4;
  return 5;
}
