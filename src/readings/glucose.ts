// Glucose variability and timeline markers. Descriptive statistics only: there are NO diabetes thresholds here.
// The "in range" band is a configurable PLACEHOLDER (READINGS_CONFIG.glucose, TODO(flight-surgeon)).

import type { Obs } from '../sim/types';

export interface GlucoseBand { low: number; high: number }
export interface GlucosePoint { t: number; v: number }

export interface GlucoseStats {
  n: number;
  mean: number;
  /** Sample standard deviation, mg/dL. */
  sd: number;
  /** Coefficient of variation: SD / mean x 100, %. */
  cv: number;
  /** Share of time inside the band, 0 to 100 (time-weighted). */
  timeInRange: number;
  timeBelow: number;
  timeAbove: number;
  min: number;
  max: number;
}

/** Longest gap between two readings that still counts as continuous when weighting by time. */
export const MAX_GAP_MS = 30 * 60_000;

export function glucosePoints(obs: Obs[]): GlucosePoint[] {
  return obs.filter((o) => typeof o.value === 'number' && o.quality === 'good').map((o) => ({ t: o.measuredAt, v: o.value as number })).sort((a, b) => a.t - b.t);
}

export function glucoseStats(points: GlucosePoint[], band: GlucoseBand): GlucoseStats | null {
  const n = points.length;
  if (n === 0) return null;
  const vals = points.map((p) => p.v);
  const mean = vals.reduce((s, v) => s + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  // Time weighting: each reading covers the time until the next one, capped at MAX_GAP_MS. A single reading falls back to counts.
  const time = { below: 0, within: 0, above: 0 }, count = { below: 0, within: 0, above: 0 };
  for (let i = 0; i < n; i++) {
    const k = points[i].v < band.low ? 'below' : points[i].v > band.high ? 'above' : 'within';
    count[k]++;
    time[k] += i < n - 1 ? Math.min(points[i + 1].t - points[i].t, MAX_GAP_MS) : 0;
  }
  const useTime = time.below + time.within + time.above > 0;
  const src = useTime ? time : count;
  const total = src.below + src.within + src.above;
  const pct = (x: number) => (x / total) * 100;
  return {
    n, mean, sd, cv: mean > 0 ? (sd / mean) * 100 : 0, timeInRange: pct(src.within), timeBelow: pct(src.below), timeAbove: pct(src.above), min: Math.min(...vals), max: Math.max(...vals),
  };
}

export interface Marker { t: number; label: string; kind: 'meal' | 'activity' }

/** Meals: logged carbohydrate in replayed data, or each distinct "last meal" time carried by the readings' context. */
export function mealMarkers(glucose: Obs[]): Marker[] {
  const out: Marker[] = [];
  const seen = new Set<number>();
  for (const o of glucose) {
    const carbs = o.meta?.mealCarbsG;
    if (typeof carbs === 'number') { out.push({ t: o.measuredAt, label: `meal ${Math.round(carbs)} g carbs`, kind: 'meal' }); continue; }
    const at = o.ctx?.mealAt;
    if (typeof at === 'number' && !seen.has(at) && at <= o.measuredAt) { seen.add(at); out.push({ t: at, label: 'meal', kind: 'meal' }); }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Activity: the start of each run of "active" readings that lasts at least `minMs`. Runs split when the gap exceeds `gapMs` (20 min: older readings are thinned to one per 15 min). */
export function activityMarkers(activity: Obs[], minMs = 10 * 60_000, gapMs = 20 * 60_000): Marker[] {
  const out: Marker[] = [];
  let start: number | null = null, last = 0;
  const flush = () => { if (start !== null && last - start >= minMs) out.push({ t: start, label: 'activity', kind: 'activity' }); start = null; };
  for (const o of [...activity].sort((a, b) => a.measuredAt - b.measuredAt)) {
    if (o.value !== 'active') { flush(); continue; }
    if (start !== null && o.measuredAt - last > gapMs) flush();
    if (start === null) start = o.measuredAt;
    last = o.measuredAt;
  }
  flush();
  return out;
}
