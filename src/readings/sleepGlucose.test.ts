import { describe, expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { seriesOf } from '../sim/selectors';
import type { Obs } from '../sim/types';
import { activityMarkers, glucosePoints, glucoseStats, mealMarkers, MAX_GAP_MS } from './glucose';
import { buildNights, overnightRestingHr, percentile, preferredNights, sleepTrend } from './sleep';

const MIN = 60_000;
const band = { low: 70, high: 140 };
const pts = (vals: number[], step = 5 * MIN) => vals.map((v, i) => ({ t: i * step, v }));

describe('glucose variability', () => {
  it('computes mean, sample SD and CV', () => {
    const s = glucoseStats(pts([90, 100, 110]), band)!;
    expect(s.mean).toBe(100);
    expect(s.sd).toBe(10);
    expect(s.cv).toBe(10);
    expect(s.n).toBe(3);
  });
  it('time in range is weighted by time, not by count', () => {
    // 100 for 5 min, 150 for 5 min, then the last reading (no duration): half the covered time is in range
    const s = glucoseStats(pts([100, 150, 100]), band)!;
    expect(s.timeInRange).toBeCloseTo(50, 6);
    expect(s.timeAbove).toBeCloseTo(50, 6);
    expect(s.timeBelow).toBe(0);
  });
  it('caps long gaps so a sensor outage does not count as time', () => {
    const s = glucoseStats([{ t: 0, v: 100 }, { t: 5 * 60 * MIN, v: 200 }, { t: 5 * 60 * MIN + 5 * MIN, v: 200 }], band)!;
    expect(MAX_GAP_MS).toBe(30 * MIN);
    // 100 covers only 30 min (in range), 200 covers 5 min (above)
    expect(s.timeInRange).toBeCloseTo((30 / 35) * 100, 6);
  });
  it('uses the configured band', () => {
    expect(glucoseStats(pts([100, 100, 100]), { low: 110, high: 140 })!.timeBelow).toBe(100);
  });
  it('a single reading falls back to counts, no readings gives null', () => {
    expect(glucoseStats(pts([100]), band)!.timeInRange).toBe(100);
    expect(glucoseStats([], band)).toBeNull();
  });
  it('ignores missing and poor readings', () => {
    const o = (v: number | null, q: Obs['quality']): Obs => ({ id: 'x', subjectId: 'A1', metric: 'glucose', value: v, units: 'mg/dL', measuredAt: 0, deviceId: 'CGM-A1', quality: q, origin: 'simulated' });
    expect(glucosePoints([o(90, 'good'), o(null, 'missing'), o(95, 'poor')])).toHaveLength(1);
  });
});

describe('markers', () => {
  const g = (t: number, p: Partial<Obs> = {}): Obs => ({ id: String(t), subjectId: 'A1', metric: 'glucose', value: 90, units: 'mg/dL', measuredAt: t, deviceId: 'CGM-A1', quality: 'good', origin: 'simulated', ...p });
  it('takes meals from logged carbs and from distinct last-meal times', () => {
    const m = mealMarkers([
      g(10 * MIN, { meta: { mealCarbsG: 55 } }),
      g(20 * MIN, { ctx: { posture: 'seated', exerciseAt: null, mealAt: 5 * MIN, sleepHours: null, notes: null } }),
      g(30 * MIN, { ctx: { posture: 'seated', exerciseAt: null, mealAt: 5 * MIN, sleepHours: null, notes: null } }),
    ]);
    expect(m.map((x) => x.t)).toEqual([5 * MIN, 10 * MIN]);
    expect(m[1].label).toContain('55 g');
  });
  it('marks the start of each sustained activity period', () => {
    const a = (t: number, v: string): Obs => ({ id: String(t), subjectId: 'A1', metric: 'activity', value: v, units: 'state', measuredAt: t, deviceId: 'BAND-A1', quality: 'good', origin: 'simulated' });
    const obs = [0, 5, 10, 15, 20].map((m) => a(m * MIN, 'active')).concat([a(25 * MIN, 'resting'), a(30 * MIN, 'active'), a(35 * MIN, 'resting')]);
    expect(activityMarkers(obs).map((m) => m.t)).toEqual([0]); // the 30 to 35 min blip is too short
  });
});

describe('sleep summary', () => {
  const night = (id: string, end: number, hours: number, meta: Obs['meta'] = {}, origin: Obs['origin'] = 'simulated', device = 'BAND-A1'): Obs => ({
    id, subjectId: 'A1', metric: 'sleep', value: hours, units: 'h', measuredAt: end, deviceId: device, quality: 'good', origin, meta: { end, ...meta },
  });
  const hr = (t: number, v: number): Obs => ({ id: 'h' + t, subjectId: 'A1', metric: 'heart_rate', value: v, units: 'bpm', measuredAt: t, deviceId: 'BAND-A1', quality: 'good', origin: 'simulated' });
  it('percentile', () => expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3));
  it('overnight resting HR from the band readings, needs enough data', () => {
    const many = Array.from({ length: 30 }, (_, i) => hr(i * 10 * MIN, 50 + (i % 10)));
    expect(overnightRestingHr(many, 0, 300 * MIN)).toBe(51);
    expect(overnightRestingHr(many.slice(0, 5), 0, 300 * MIN)).toBeNull();
  });
  it('reads efficiency and stages when the source provides them, leaves them empty otherwise', () => {
    const [a, b] = buildNights([night('n1', 100, 7), night('n2', 200, 7.2, { efficiencyPct: 90, awakeMin: 30, lightMin: 250, deepMin: 80, remMin: 90, restingHr: 52 }, 'replay', 'REPLAY-BAND')], []);
    expect(a.efficiencyPct).toBeNull();
    expect(a.stages).toBeNull();
    expect(b).toMatchObject({ efficiencyPct: 90, restingHr: 52, source: 'replay' });
    expect(b.stages).toEqual({ awakeMin: 30, lightMin: 250, deepMin: 80, remMin: 90 });
  });
  it('prefers the band, falls back to replay', () => {
    const n = buildNights([night('a', 1, 7), night('b', 2, 7, {}, 'replay', 'REPLAY-BAND')], []);
    expect(preferredNights(n).source).toBe('whoop');
    expect(preferredNights(n.filter((x) => x.source === 'replay')).source).toBe('replay');
    expect(preferredNights([]).source).toBeNull();
  });
  it('compares the latest night with earlier nights only when there are enough', () => {
    const mk = (hours: number[]) => buildNights(hours.map((h, i) => night('n' + i, (i + 1) * 1000, h)), []);
    expect(sleepTrend(mk([7, 7.2, 6.8])).enough).toBe(false); // only 2 earlier nights
    const t = sleepTrend(mk([7, 7.2, 6.8, 7.1, 4]));
    expect(t.enough).toBe(true);
    expect(t.durationVs).toBe('below');
    expect(sleepTrend(mk([7, 7.2, 6.8, 7.1, 7])).durationVs).toBe('within');
  });
  it('the simulator provides seeded nights for the band', () => {
    const e = new SimEngine({ persist: null, online: () => true });
    e.loadScenario('routine'); e.S.ready = true;
    const nights = buildNights(seriesOf(e.S.series, 'A1', 'sleep'), seriesOf(e.S.series, 'A1', 'heart_rate'));
    expect(nights.length).toBeGreaterThanOrEqual(3);
    expect(nights.every((n) => n.source === 'whoop' && n.efficiencyPct === null)).toBe(true);
    expect(nights.some((n) => n.restingHr !== null)).toBe(true);
  });
});
