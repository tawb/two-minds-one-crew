// Bridge between the camera response check and the shared reading model.
//
// It only LISTENS to the existing "cv-result" event and stores a reading for it. It does not touch how the check
// measures anything. Last night's sleep is added here, to the stored reading's context, never inside the check.

import { CV_RESULT_EVENT, type CvResultDetail } from '../features/cv-response-check/events';
import type { Reading } from './types';

export interface CameraRecord {
  id: string;
  subjectId: string;
  timestamp: string; // ISO
  /** Median reaction-round time in ms, or null if none could be measured. */
  medianReactionMs: number | null;
  state: string;
  /** null while the check is still calibrating its own baseline. */
  baselineDeviation: number | null;
  completed: number;
  total: number;
  errors: number;
  lapses: number;
  falseStarts: number;
  /** Last night's sleep at the time of the check, from the shared reading model; null = unknown. */
  sleepLastNightHours: number | null;
}

export interface BridgeContext { subjectId: string; sleepHours: number | null }

export function recordFromEvent(d: CvResultDetail, ctx: BridgeContext): CameraRecord {
  return {
    id: `CAM-${d.timestamp}`, subjectId: ctx.subjectId, timestamp: new Date(d.timestamp).toISOString(),
    medianReactionMs: d.medianReactionMs, state: d.state, baselineDeviation: d.baselineDeviation,
    completed: d.completed, total: d.total, errors: d.errors, lapses: d.lapses, falseStarts: d.falseStarts,
    sleepLastNightHours: ctx.sleepHours,
  };
}

/** The same record in the common reading model (metric response_ms, source camera). */
export function toCameraReading(r: CameraRecord): Reading {
  return {
    id: r.id, subjectId: r.subjectId, metric: 'response_ms', value: r.medianReactionMs, unit: 'ms', timestamp: r.timestamp, deviceId: 'CAMERA',
    source: 'camera', quality: r.state === 'inconclusive' || r.medianReactionMs === null ? 'unknown' : 'good',
    calibration: { state: r.baselineDeviation === null ? 'calibrating' : 'calibrated', lastCalibratedAt: null, daysSince: null },
    context: { posture: 'unknown', minutesSinceExercise: null, minutesSinceMeal: null, sleepLastNightHours: r.sleepLastNightHours, notes: null },
  };
}

const KEY = 'av:camera-readings:v1';
const MAX = 60;

export function loadCameraRecords(storage: Pick<Storage, 'getItem'> | null = safeStorage()): CameraRecord[] {
  try {
    const raw = storage?.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as CameraRecord[]) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function saveCameraRecord(r: CameraRecord, storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): void {
  try {
    const all = [...loadCameraRecords(storage).filter((x) => x.id !== r.id), r].slice(-MAX);
    storage?.setItem(KEY, JSON.stringify(all));
  } catch { /* storage unavailable: the reading is simply not kept */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Start listening. Returns a function that stops. */
export function installCvBridge(getContext: () => BridgeContext, target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const onResult = (ev: Event) => saveCameraRecord(recordFromEvent((ev as CustomEvent<CvResultDetail>).detail, getContext()));
  target.addEventListener(CV_RESULT_EVENT, onResult);
  return () => target.removeEventListener(CV_RESULT_EVENT, onResult);
}
