// All demonstration thresholds and timings are SIMULATION PARAMETERS (report §5, §8).
// They are design choices for this prototype, not clinical limits. Clinical diagnosis and
// treatment require approved rules owned by medical personnel.

import type { Metric } from './types';

export const H = 3_600_000;
export const DAY = 24 * H;

/** Fixed simulated clock start so every replay is repeatable: 14 Nov 2026, 14:00 UTC. */
export const T_START = Date.UTC(2026, 10, 14, 14, 0, 0);
/** Mission day 1 (label only). */
export const MISSION_DAY1 = T_START - 120 * DAY;

export const SIM = {
  intervals: { // report §5 proposed simulation settings
    heartRateMs: 5_000,
    activityMs: 5_000,
    skinTempMs: 60_000,
    glucoseMs: 60_000,
    cabinMs: 10_000,
  },
  stale: { // after this age a "last valid value" is shown as stale
    heart_rate: 30_000, activity: 30_000, skin_temp: 180_000, glucose: 180_000,
    co2: 60_000, cabin_temp: 60_000, cabin_rh: 60_000, bp: 8 * H, sleep: 36 * H,
  } as Record<string, number>,
  thresholds: {
    restingPulseVerify: 100, // bpm, sustained while activity = resting
    restingPulseReview: 120,
    skinTempVerify: 35.5, // °C wrist skin trend (not a core temperature)
    bpVerifySys: 140, bpVerifyDia: 90, // mmHg, completed cuff result
    bpReviewSys: 160, bpReviewDia: 100,
    glucoseLow: 70, glucoseHigh: 180, glucoseReviewLow: 54, glucoseReviewHigh: 250, // mg/dL
    shortSleepH: 6,
    co2Verify: 1500, co2Review: 3000, // ppm (original unit preserved; no averaging interval defined)
    contextWindowMs: 60 * 60_000, // CO₂ context window before symptom report
    contextStaleMs: 15 * 60_000, // module CO₂ older than this is "stale" for context
    batteryLowPct: 20,
    deviceMissingMs: 30_000, // before a device-status message is raised
    delayedDataMs: 60_000, // Earth receipt later than this after measurement = delayed
  },
  cuff: {
    durationMs: 45_000,
    scheduleEveryMs: 10 * 60_000,
    firstOffsetsMs: { A1: 60_000, A2: 150_000, A3: 240_000, A4: 30_000 } as Record<string, number>,
    batteryPerCycle: 1.5, // %
  },
  comms: { delayOptionsMs: [1_300, 15_000, 240_000] },
  history: { fullResSinceMs: 3 * H, coarseStepMs: 30 * 60_000, days: 4 },
  prune: { fullResWindowMs: 2 * H, bucketMs: 15 * 60_000 },
};

export const THINNABLE: Metric[] = ['heart_rate', 'activity', 'skin_temp', 'glucose', 'co2', 'cabin_temp', 'cabin_rh'];

export function staleLimit(metric: Metric): number {
  if (metric === 'bp_systolic' || metric === 'bp_diastolic') return SIM.stale.bp;
  if (metric === 'sleep') return SIM.stale.sleep;
  return SIM.stale[metric] ?? 24 * H;
}
