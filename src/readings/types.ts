// The single reading model used everywhere (Phase 1). Plain data only, units always explicit.
// The simulation stores observations (src/sim/types.ts `Obs`); `toReading` in model.ts converts them to this shape,
// and replay, sleep, glucose, baselines and export all work on `Reading`.

export type Posture = 'seated' | 'standing' | 'lying' | 'unknown';

/** Where a reading came from. "camera" is an addition to the original list: the response check is camera-based and
 *  none of the other values would describe it honestly. */
export type ReadingSource = 'whoop' | 'cuff' | 'glucose' | 'replay' | 'manual' | 'camera';

export type ReadingQuality = 'good' | 'motion' | 'poor_fit' | 'unknown';
export type CalibrationState = 'calibrating' | 'calibrated' | 'stale';

export type ReadingMetric =
  | 'heart_rate' | 'hrv_rmssd' | 'bp_systolic' | 'bp_diastolic' | 'glucose' | 'skin_temp'
  | 'sleep' | 'activity' | 'spo2' | 'response_ms';

export const METRIC_UNIT: Record<ReadingMetric, string> = {
  heart_rate: 'bpm', hrv_rmssd: 'ms', bp_systolic: 'mmHg', bp_diastolic: 'mmHg', glucose: 'mg/dL',
  skin_temp: '°C', sleep: 'h', activity: 'state', spo2: '%', response_ms: 'ms',
};

export interface ReadingContext {
  posture: Posture;
  /** Minutes between the last exercise and this reading; null = unknown. */
  minutesSinceExercise: number | null;
  minutesSinceMeal: number | null;
  sleepLastNightHours: number | null;
  notes: string | null;
}

export interface ReadingCalibration {
  state: CalibrationState;
  /** ISO time of the last calibration, or null if none applies / none yet. */
  lastCalibratedAt: string | null;
  daysSince: number | null;
}

export interface Reading {
  id: string;
  /** Pseudonymous subject (astronaut id in the app; replaced by an alias on export). */
  subjectId: string;
  metric: ReadingMetric;
  value: number | string | null; // null = explicit missing value
  unit: string;
  timestamp: string; // ISO 8601
  deviceId: string;
  source: ReadingSource;
  quality: ReadingQuality;
  calibration: ReadingCalibration;
  context: ReadingContext;
}

/** Context as stored on an observation: absolute times, so "minutes since" is computed at reading time. */
export interface StoredContext {
  posture: Posture;
  exerciseAt: number | null;
  mealAt: number | null;
  sleepHours: number | null;
  notes: string | null;
  /** True if any field came from the simulator's schedule rather than from the astronaut. */
  derived?: boolean;
}

/** What the astronaut (or the check-up flow) has entered. Unknown fields are "unknown" / null and never block a reading. */
export interface ContextInput {
  posture: Posture;
  exerciseAt: number | null;
  mealAt: number | null;
  sleepHours: number | null;
  notes: string | null;
}

export const UNKNOWN_CONTEXT: ReadingContext = {
  posture: 'unknown', minutesSinceExercise: null, minutesSinceMeal: null, sleepLastNightHours: null, notes: null,
};
