import { describe, expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { lastValid } from '../sim/selectors';
import { contextBucket, mad, median, personalBaseline, resolveRange, sessionValues, type SessionReading } from './baseline';
import { READINGS_CONFIG } from './config';
import { bandOf, referenceFor, type AgingReference } from './reference';
import { rangeOf } from './view';
import { UNKNOWN_CONTEXT, type Reading, type ReadingContext } from './types';

const aging: AgingReference = {
  source: 'test source', method: '', limits: '', used: 100, dropped: 0,
  bands: [
    { ageMin: 35, ageMax: 49, sex: 'female', n: 20, hr: { p5: 57, median: 70, p95: 90 }, rmssd: { p5: 17, median: 38, p95: 65 } },
    { ageMin: 35, ageMax: 49, sex: 'male', n: 4, hr: { p5: 60, median: 72, p95: 85 }, rmssd: { p5: 20, median: 30, p95: 50 } },
  ],
};
const ctx = (p: Partial<ReadingContext> = {}): ReadingContext => ({ ...UNKNOWN_CONTEXT, ...p });
const resting = ctx({ posture: 'seated', minutesSinceExercise: 300 });

describe('reference ranges', () => {
  it('uses the data-derived band for the matching age and sex when n is large enough', () => {
    const r = referenceFor('resting_hr', 42, 'female', aging);
    expect(r).toMatchObject({ basis: 'autonomic-aging', low: 57, high: 90, median: 70, n: 20 });
    expect(r.label).toContain('female');
    expect(referenceFor('hrv_rmssd', 42, 'female', aging)).toMatchObject({ low: 17, high: 65 });
  });
  it('different sex gives a different band', () => expect(bandOf(42, 'male', aging)!.hr.median).toBe(72));
  it('falls back to a marked placeholder when the sample is too small, the age is outside, or no data exists', () => {
    for (const r of [referenceFor('resting_hr', 40, 'male', aging), referenceFor('resting_hr', 70, 'female', aging), referenceFor('resting_hr', 40, 'female', null)]) {
      expect(r.basis).toBe('placeholder');
      expect(r.label).toContain('placeholder');
      expect(r.source).toContain('TODO(flight-surgeon)');
    }
  });
  it('blood pressure has no data-derived band: always a marked placeholder', () => {
    expect(referenceFor('bp_systolic', 42, 'female', aging).basis).toBe('placeholder');
  });
  it('the minimum sample size is configurable', () => expect(referenceFor('resting_hr', 40, 'male', aging, 3).basis).toBe('autonomic-aging'));
});

describe('median and MAD', () => {
  it('computes them', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
  });
  it('is robust to one outlier session', () => {
    const b = personalBaseline([60, 61, 62, 60, 61, 62, 150])!;
    expect(b.median).toBe(61);
    expect(b.high).toBeLessThan(75);
  });
  it('keeps a minimum spread when the history is very steady', () => {
    const b = personalBaseline([60, 60, 60, 60, 60, 60, 60])!;
    expect(b.high).toBeGreaterThan(60);
    expect(b.low).toBeLessThan(60);
  });
});

describe('context buckets', () => {
  it('splits resting seated from after exercise and unknown', () => {
    expect(contextBucket(resting)).toBe('resting_seated');
    expect(contextBucket(ctx({ posture: 'seated', minutesSinceExercise: 20 }))).toBe('after_exercise');
    expect(contextBucket(ctx({ posture: 'seated' }))).toBe('unknown');
    expect(contextBucket(ctx({ posture: 'unknown', minutesSinceExercise: 300 }))).toBe('unknown');
    expect(contextBucket(ctx({ posture: 'standing', minutesSinceExercise: 300 }))).toBe('other');
  });
});

const item = (session: string, value: number, c: ReadingContext, quality: Reading['quality'] = 'good'): SessionReading => ({
  session,
  reading: {
    id: session + value, subjectId: 'A1', metric: 'heart_rate', value, unit: 'bpm', timestamp: '2026-11-14T10:00:00Z', deviceId: 'BAND-A1', source: 'whoop', quality,
    calibration: { state: 'calibrated', lastCalibratedAt: null, daysSince: null }, context: c,
  },
});
const sessions = (n: number, c = resting, base = 62) => Array.from({ length: n }, (_, i) => item(`S${i}`, base + (i % 3), c));

describe('baseline switching', () => {
  const base = { metric: 'heart_rate' as const, value: 64, bucket: 'resting_seated' as const, age: 42, sex: 'female' as const, aging };
  it('uses the population reference before N sessions', () => {
    const r = resolveRange({ ...base, items: sessions(6) });
    expect(r).toMatchObject({ mode: 'population', sessions: 6, label: 'using population reference' });
  });
  it('switches to the personal baseline at exactly N sessions (default 7)', () => {
    expect(READINGS_CONFIG.baseline.minSessions).toBe(7);
    const r = resolveRange({ ...base, items: sessions(7) });
    expect(r.mode).toBe('personal');
    expect(r.label).toBe('using your baseline (7 sessions)');
    expect(r.position).toBe('within');
  });
  it('N is configurable', () => expect(resolveRange({ ...base, items: sessions(3), minSessions: 3 }).mode).toBe('personal'));
  it('counts sessions per context: resting sessions do not make an after-exercise baseline', () => {
    const r = resolveRange({ ...base, bucket: 'after_exercise', items: sessions(9) });
    expect(r.sessions).toBe(0);
    expect(r.mode).toBe('none'); // no population reference for the after-exercise heart rate
  });
  it('ignores motion and poor-fit readings and untagged readings for the baseline', () => {
    const items = [...sessions(6), item('S9', 70, resting, 'motion'), { ...item('x', 70, resting), session: null }];
    expect(resolveRange({ ...base, items }).sessions).toBe(6);
  });
  it('one value per session: several readings in a session count once', () => {
    const items = [item('A', 60, resting), item('A', 62, resting), item('B', 64, resting)];
    expect(sessionValues(items, 'heart_rate', 'resting_seated')).toEqual([{ session: 'A', value: 61 }, { session: 'B', value: 64 }]);
  });
  it('reports where a value sits against the range', () => {
    const p = resolveRange({ ...base, value: 120, items: sessions(7) });
    expect(p.position).toBe('above');
  });
});

describe('baseline in the engine', () => {
  it('starts on the population reference and switches after 7 backfilled sessions', () => {
    const e = new SimEngine({ persist: null, online: () => true });
    e.loadScenario('routine'); e.S.ready = true;
    e.setContext('A1', { posture: 'seated', exerciseAt: e.S.now - 6 * 3_600_000 });
    e.measureNow('A1');
    const hr = () => lastValid(e.S.series, e.S.superseded, 'A1', 'heart_rate');
    const before = rangeOf(e.S, 'A1', hr(), aging)!;
    expect(before.mode === 'population' || before.mode === 'none').toBe(true);
    e.backfillSessions('A1', 7);
    e.setContext('A1', { posture: 'seated', exerciseAt: e.S.now - 6 * 3_600_000 });
    const sysAfter = rangeOf(e.S, 'A1', lastValid(e.S.series, e.S.superseded, 'A1', 'bp_systolic'), aging)!;
    expect(sysAfter.sessions).toBeGreaterThanOrEqual(1);
    expect(sysAfter.sessions).toBeLessThanOrEqual(8);
  });
});
