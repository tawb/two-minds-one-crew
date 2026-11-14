import type { Obs } from '../sim/types';
import { calibrationBadge, calibrationFor } from './calibration';
import { missingContext, toReadingContext } from './context';
import { assessQuality, type ActivityState } from './quality';
import type { Reading, ReadingContext, ReadingMetric, ReadingQuality, ReadingSource } from './types';

export * from './types';

/** Observation metrics that are physical readings and convert to a `Reading`. */
const CONVERTIBLE: ReadingMetric[] = ['heart_rate', 'skin_temp', 'glucose', 'bp_systolic', 'bp_diastolic', 'sleep', 'activity'];
export const isReadingMetric = (m: string): m is ReadingMetric => (CONVERTIBLE as string[]).includes(m);

/** Everything needed to convert one observation. All fields optional: missing information stays "unknown". */
export interface ReadingEnv {
  /** Judge calibration at this moment. Default: the time of the reading itself. */
  nowMs?: number;
  bpCalibratedAt?: number | null;
  glucoseSensorStartAt?: number | null;
  staleDays?: number;
  /** Wrist activity at a given time (looked up from the activity series). */
  activityAt?: (ms: number) => ActivityState;
}

export function sourceOf(o: Pick<Obs, 'origin' | 'deviceId'>): ReadingSource {
  if (o.origin === 'replay') return 'replay';
  if (o.origin === 'manual') return 'manual';
  const d = o.deviceId;
  if (d.startsWith('REPLAY')) return 'replay';
  if (d.startsWith('BAND')) return 'whoop';
  if (d.startsWith('CUFF')) return 'cuff';
  if (d.startsWith('CGM')) return 'glucose';
  return 'manual';
}

/** Convert a stored observation to the common reading model, or null if it is not a physical reading. */
export function toReading(o: Obs, env: ReadingEnv = {}): Reading | null {
  if (!isReadingMetric(o.metric)) return null;
  const metric = o.metric;
  const source = sourceOf(o);
  const context: ReadingContext = toReadingContext(o.ctx, o.measuredAt);
  const activity = env.activityAt?.(o.measuredAt) ?? 'unknown';
  const explicit = (o.meta?.readingQuality as ReadingQuality | undefined) ?? null;
  const quality = assessQuality({
    metric, source, rawQuality: o.quality, explicit, activity, context,
    cuffInterference: typeof o.meta?.note === 'string' && /cuff/i.test(o.meta.note),
    fitIssue: o.meta?.reason === 'poor skin contact',
  });
  const calibration = calibrationFor(metric, {
    nowMs: env.nowMs ?? o.measuredAt,
    bpCalibratedAt: env.bpCalibratedAt,
    glucoseSensorStartAt: env.glucoseSensorStartAt,
    staleDays: env.staleDays,
  });
  return {
    id: o.id, subjectId: o.subjectId, metric, value: o.value, unit: o.units, timestamp: new Date(o.measuredAt).toISOString(),
    deviceId: o.deviceId, source, quality, calibration, context,
  };
}

export interface Badge { key: string; text: string; tone: 'ok' | 'warn' | 'bad' | 'info' }

const QUALITY_TEXT: Record<ReadingQuality, { text: string; tone: Badge['tone'] }> = {
  good: { text: 'good', tone: 'ok' },
  motion: { text: 'motion', tone: 'warn' },
  poor_fit: { text: 'poor fit', tone: 'bad' },
  unknown: { text: 'quality unknown', tone: 'info' },
};

/** Badges shown next to a number: quality, calibration (where it applies), and missing context. Nothing is hidden. */
export function badgesFor(r: Reading): Badge[] {
  const out: Badge[] = [{ key: 'q', ...QUALITY_TEXT[r.quality] }];
  const cal = calibrationBadge(r.metric, r.calibration);
  if (cal) out.push({ key: 'cal', text: cal.text, tone: cal.tone });
  const missing = missingContext(r.context, r.metric);
  if (missing.length) out.push({ key: 'ctx', text: 'context missing', tone: 'info' });
  return out;
}
