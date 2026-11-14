import { describe, expect, it } from 'vitest';
import { calibrationBadge, calibrationFor } from './calibration';
import { mergeContext, missingContext, toReadingContext } from './context';
import { badgesFor, toReading } from './model';
import { assessQuality } from './quality';
import { UNKNOWN_CONTEXT, type ReadingContext } from './types';
import type { Obs } from '../sim/types';

const DAY = 86_400_000;
const T = Date.UTC(2026, 10, 14, 14);
const ctx = (p: Partial<ReadingContext> = {}): ReadingContext => ({ ...UNKNOWN_CONTEXT, ...p });
const obs = (p: Partial<Obs> = {}): Obs => ({
  id: 'O1', subjectId: 'A1', metric: 'heart_rate', value: 64, units: 'bpm', measuredAt: T, deviceId: 'BAND-A1', quality: 'good', origin: 'simulated', ...p,
});

describe('reading model', () => {
  it('converts an observation with explicit unit, ISO time, source', () => {
    const r = toReading(obs())!;
    expect(r).toMatchObject({ metric: 'heart_rate', value: 64, unit: 'bpm', deviceId: 'BAND-A1', source: 'whoop', timestamp: '2026-11-14T14:00:00.000Z' });
  });
  it('maps devices and origins to sources', () => {
    expect(toReading(obs({ deviceId: 'CUFF-A1', metric: 'bp_systolic' }))!.source).toBe('cuff');
    expect(toReading(obs({ deviceId: 'CGM-A1', metric: 'glucose' }))!.source).toBe('glucose');
    expect(toReading(obs({ origin: 'replay', deviceId: 'REPLAY-1' }))!.source).toBe('replay');
    expect(toReading(obs({ origin: 'manual' }))!.source).toBe('manual');
  });
  it('ignores cabin metrics', () => expect(toReading(obs({ metric: 'co2' }))).toBeNull());
  it('keeps missing values explicit', () => expect(toReading(obs({ value: null, quality: 'missing' }))!.value).toBeNull());
  it('always shows a quality badge and never drops the reading', () => {
    const b = badgesFor(toReading(obs())!);
    expect(b.find((x) => x.key === 'q')).toBeTruthy();
  });
});

describe('context tagging', () => {
  it('user fields win over the simulator, unknown ones fall back to it', () => {
    const sim = { posture: 'seated' as const, exerciseAt: T - 3600_000, mealAt: T - 7200_000, sleepHours: 7, notes: null };
    const m = mergeContext({ posture: 'lying', exerciseAt: null, mealAt: null, sleepHours: null, notes: null }, sim);
    expect(m.posture).toBe('lying');
    expect(m.exerciseAt).toBe(T - 3600_000);
    expect(m.derived).toBe(true);
  });
  it('stays unknown without a simulator and never throws', () => {
    const m = mergeContext(undefined, null);
    expect(m).toMatchObject({ posture: 'unknown', exerciseAt: null, mealAt: null, sleepHours: null });
    expect(m.derived).toBeUndefined();
  });
  it('turns absolute times into minutes at reading time', () => {
    const c = toReadingContext({ posture: 'seated', exerciseAt: T - 90 * 60_000, mealAt: null, sleepHours: 6.5, notes: null }, T);
    expect(c).toMatchObject({ minutesSinceExercise: 90, minutesSinceMeal: null, sleepLastNightHours: 6.5 });
  });
  it('reports missing context per metric', () => {
    expect(missingContext(ctx(), 'heart_rate')).toEqual(['posture', 'exercise']);
    expect(missingContext(ctx({ posture: 'seated', minutesSinceExercise: 200 }), 'heart_rate')).toEqual([]);
    expect(missingContext(ctx(), 'glucose')).toEqual(['meal', 'exercise']);
  });
  it('labels a reading with missing context', () => {
    expect(badgesFor(toReading(obs())!).some((b) => b.key === 'ctx')).toBe(true);
  });
});

describe('quality rules', () => {
  const base = { metric: 'heart_rate' as const, source: 'whoop' as const, rawQuality: 'good' as const, context: ctx({ posture: 'seated' }) };
  it('good at rest', () => expect(assessQuality({ ...base, activity: 'resting' })).toBe('good'));
  it('motion when the wrist is active', () => expect(assessQuality({ ...base, activity: 'active' })).toBe('motion'));
  it('motion for cuff interference', () => expect(assessQuality({ ...base, cuffInterference: true })).toBe('motion'));
  it('poor fit wins', () => expect(assessQuality({ ...base, activity: 'active', fitIssue: true })).toBe('poor_fit'));
  it('unknown for missing values and manual entries', () => {
    expect(assessQuality({ ...base, rawQuality: 'missing' })).toBe('unknown');
    expect(assessQuality({ ...base, source: 'manual' })).toBe('unknown');
  });
  it('glucose is not marked as motion', () => expect(assessQuality({ ...base, metric: 'glucose', activity: 'active' })).toBe('good'));
  it('an explicit upstream quality wins', () => expect(assessQuality({ ...base, explicit: 'poor_fit' })).toBe('poor_fit'));
});

describe('calibration age', () => {
  it('calibrating when never calibrated', () => expect(calibrationFor('bp_systolic', { nowMs: T }).state).toBe('calibrating'));
  it('calibrated inside the limit, stale at the default 30 days', () => {
    expect(calibrationFor('bp_systolic', { nowMs: T, bpCalibratedAt: T - 29 * DAY }).state).toBe('calibrated');
    const s = calibrationFor('bp_diastolic', { nowMs: T, bpCalibratedAt: T - 30 * DAY });
    expect(s).toMatchObject({ state: 'stale', daysSince: 30 });
  });
  it('limit is configurable', () => expect(calibrationFor('bp_systolic', { nowMs: T, bpCalibratedAt: T - 10 * DAY, staleDays: 7 }).state).toBe('stale'));
  it('badge text', () => {
    expect(calibrationBadge('bp_systolic', calibrationFor('bp_systolic', { nowMs: T, bpCalibratedAt: T - 24 * DAY }))!.text).toBe('calibration 24 days old');
    expect(calibrationBadge('bp_systolic', calibrationFor('bp_systolic', { nowMs: T, bpCalibratedAt: T - 40 * DAY }))!.text).toContain('needs calibration');
    expect(calibrationBadge('heart_rate', calibrationFor('heart_rate', { nowMs: T }))).toBeNull();
  });
  it('glucose warm-up is calibrating', () => {
    expect(calibrationFor('glucose', { nowMs: T, glucoseSensorStartAt: T - 10 * 60_000 }).state).toBe('calibrating');
    expect(calibrationFor('glucose', { nowMs: T, glucoseSensorStartAt: T - 5 * DAY }).state).toBe('calibrated');
  });
});
