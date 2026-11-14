import { READINGS_CONFIG } from './config';
import type { ReadingCalibration, ReadingMetric } from './types';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

export interface CalibrationEnv {
  /** The moment to judge the calibration at: "now" for display, the reading time for provenance. */
  nowMs: number;
  /** When the upper-arm cuff was last calibrated against a reference measurement; null = never. */
  bpCalibratedAt?: number | null;
  /** When the current glucose sensor was applied; null = unknown. */
  glucoseSensorStartAt?: number | null;
  staleDays?: number;
  warmupMinutes?: number;
}

export const isBp = (m: ReadingMetric) => m === 'bp_systolic' || m === 'bp_diastolic';

/**
 * Calibration state of a reading.
 *   blood pressure: never calibrated -> "calibrating"; older than the limit -> "stale" ("needs calibration")
 *   glucose: "calibrating" during the sensor warm-up, then "calibrated"
 *   everything else has no calibration step: "calibrated" with no date
 */
export function calibrationFor(metric: ReadingMetric, env: CalibrationEnv): ReadingCalibration {
  const staleDays = env.staleDays ?? READINGS_CONFIG.bpCalibration.staleAfterDays;
  if (isBp(metric)) {
    const at = env.bpCalibratedAt ?? null;
    if (at === null) return { state: 'calibrating', lastCalibratedAt: null, daysSince: null };
    const daysSince = Math.max(0, Math.floor((env.nowMs - at) / DAY));
    return { state: daysSince >= staleDays ? 'stale' : 'calibrated', lastCalibratedAt: iso(at), daysSince };
  }
  if (metric === 'glucose') {
    const start = env.glucoseSensorStartAt ?? null;
    if (start === null) return { state: 'calibrated', lastCalibratedAt: null, daysSince: null };
    const warm = (env.warmupMinutes ?? READINGS_CONFIG.glucoseSensor.warmupMinutes) * 60_000;
    return {
      state: env.nowMs - start < warm ? 'calibrating' : 'calibrated',
      lastCalibratedAt: iso(start),
      daysSince: Math.max(0, Math.floor((env.nowMs - start) / DAY)),
    };
  }
  return { state: 'calibrated', lastCalibratedAt: null, daysSince: null };
}

/** Text for the badge next to a number, or null when there is nothing worth saying. */
export function calibrationBadge(metric: ReadingMetric, c: ReadingCalibration): { text: string; tone: 'ok' | 'warn' } | null {
  if (isBp(metric)) {
    if (c.state === 'calibrating') return { text: 'calibrating', tone: 'warn' };
    if (c.state === 'stale') return { text: `needs calibration (${c.daysSince} days old)`, tone: 'warn' };
    return { text: c.daysSince === 0 ? 'calibrated today' : `calibration ${c.daysSince} day${c.daysSince === 1 ? '' : 's'} old`, tone: 'ok' };
  }
  if (metric === 'glucose' && c.state === 'calibrating') return { text: 'calibrating (sensor warm-up)', tone: 'warn' };
  return null;
}
