// Sleep summary from the reading model. Data only: duration, efficiency and stages when the source provides them,
// overnight resting heart rate, and a comparison with the person's own previous nights. No advice.

import type { Obs } from '../sim/types';
import { READINGS_CONFIG } from './config';
import { mad, median, personalBaseline } from './baseline';
import { sourceOf } from './model';
import type { ReadingSource } from './types';

export interface SleepNight {
  id: string;
  start: number | null;
  end: number;
  hours: number | null;
  /** null = the source does not estimate it (the simulated band gives duration only). */
  efficiencyPct: number | null;
  stages: { awakeMin: number; lightMin: number; deepMin: number; remMin: number } | null;
  /** Lowest-decile heart rate during the night, bpm; null if too few readings. */
  restingHr: number | null;
  source: ReadingSource;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function percentile(values: number[], p: number): number {
  const a = [...values].sort((x, y) => x - y);
  const k = (a.length - 1) * p;
  const f = Math.floor(k);
  return a[f] + (a[Math.min(a.length - 1, f + 1)] - a[f]) * (k - f);
}

/** Heart rate while asleep: the 10th percentile of the readings between the start and end of the night. Needs at least 10 readings. */
export function overnightRestingHr(hr: Obs[], start: number, end: number): number | null {
  const v = hr.filter((o) => o.measuredAt >= start && o.measuredAt <= end && typeof o.value === 'number' && o.quality === 'good').map((o) => o.value as number);
  return v.length >= 10 ? Math.round(percentile(v, 0.1)) : null;
}

export function buildNights(sleep: Obs[], hr: Obs[]): SleepNight[] {
  const out: SleepNight[] = [];
  for (const o of sleep) {
    if (typeof o.value !== 'number') continue;
    const m = o.meta ?? {};
    const end = num(m.end) ?? o.measuredAt;
    const start = num(m.start) ?? (end - o.value * 3_600_000);
    const awake = num(m.awakeMin), light = num(m.lightMin), deep = num(m.deepMin), rem = num(m.remMin);
    out.push({
      id: o.id, start, end, hours: o.value, efficiencyPct: num(m.efficiencyPct),
      stages: awake !== null && light !== null && deep !== null && rem !== null ? { awakeMin: awake, lightMin: light, deepMin: deep, remMin: rem } : null,
      restingHr: num(m.restingHr) ?? overnightRestingHr(hr, start, end),
      source: sourceOf(o),
    });
  }
  return out.sort((a, b) => a.end - b.end);
}

/** Prefer the band's own nights; fall back to replayed nights only if the band has none. */
export function preferredNights(nights: SleepNight[]): { nights: SleepNight[]; source: ReadingSource | null } {
  const whoop = nights.filter((n) => n.source === 'whoop');
  if (whoop.length) return { nights: whoop, source: 'whoop' };
  const replay = nights.filter((n) => n.source === 'replay');
  if (replay.length) return { nights: replay, source: 'replay' };
  return { nights: [], source: null };
}

export type Where = 'within' | 'above' | 'below';
export interface SleepTrend {
  /** Nights before the latest one that the comparison is based on. */
  basis: number;
  durationMedian: number | null;
  durationVs: Where | null;
  restingHrMedian: number | null;
  restingHrVs: Where | null;
  enough: boolean;
}

const where = (v: number, lo: number, hi: number): Where => (v < lo ? 'below' : v > hi ? 'above' : 'within');

/** The latest night against the person's own earlier nights (median +/- k x scaled MAD). Needs `minNightsForTrend` earlier nights. */
export function sleepTrend(nights: SleepNight[], minNights = READINGS_CONFIG.sleep.minNightsForTrend as number): SleepTrend {
  if (nights.length < 2) return { basis: 0, durationMedian: null, durationVs: null, restingHrMedian: null, restingHrVs: null, enough: false };
  const latest = nights[nights.length - 1];
  const prior = nights.slice(0, -1);
  const durs = prior.map((n) => n.hours).filter((v): v is number => v !== null);
  const hrs = prior.map((n) => n.restingHr).filter((v): v is number => v !== null);
  const enough = durs.length >= minNights;
  const db = enough ? personalBaseline(durs) : null;
  const hb = hrs.length >= minNights ? personalBaseline(hrs) : null;
  return {
    basis: prior.length, enough,
    durationMedian: durs.length ? median(durs) : null,
    durationVs: db && latest.hours !== null ? where(latest.hours, db.low, db.high) : null,
    restingHrMedian: hrs.length ? median(hrs) : null,
    restingHrVs: hb && latest.restingHr !== null ? where(latest.restingHr, hb.low, hb.high) : null,
  };
}

export { mad };
