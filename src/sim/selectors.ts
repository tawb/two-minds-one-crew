// Read-only helpers shared by the engine's rules and the UI. They work on either the onboard
// series or the Earth-received series, so both sides use the same definitions of "stale" etc.

import { staleLimit } from './params';
import type { Metric, Obs } from './types';

export type SeriesMap = Map<string, Obs[]>;
export const sk = (subjectId: string, metric: Metric | string) => `${subjectId}|${metric}`;

/** Usable value: present and not excluded. "poor" quality values are shown but flagged. */
export const isValid = (o: Obs) => o.value !== null && (o.quality === 'good' || o.quality === 'poor');

export function seriesOf(map: SeriesMap, subjectId: string, metric: Metric): Obs[] {
  return map.get(sk(subjectId, metric)) ?? [];
}

export function lastValid(map: SeriesMap, superseded: Set<string>, subjectId: string, metric: Metric, goodOnly = false): Obs | null {
  const arr = seriesOf(map, subjectId, metric);
  for (let i = arr.length - 1; i >= 0; i--) {
    const o = arr[i];
    if (superseded.has(o.id)) continue;
    if (isValid(o) && (!goodOnly || o.quality === 'good')) return o;
  }
  return null;
}

export function latestAny(map: SeriesMap, superseded: Set<string>, subjectId: string, metric: Metric): Obs | null {
  const arr = seriesOf(map, subjectId, metric);
  for (let i = arr.length - 1; i >= 0; i--) if (!superseded.has(arr[i].id)) return arr[i];
  return null;
}

export type ReadingState = 'current' | 'stale' | 'missing' | 'none';
export interface Reading {
  obs: Obs | null; // last valid observation
  latest: Obs | null; // newest record of any quality (may be a "missing" record)
  ageMs: number | null; // age of the last valid observation
  state: ReadingState;
}

export function reading(map: SeriesMap, superseded: Set<string>, now: number, subjectId: string, metric: Metric): Reading {
  const obs = lastValid(map, superseded, subjectId, metric);
  const latest = latestAny(map, superseded, subjectId, metric);
  if (!obs) return { obs: null, latest, ageMs: null, state: 'none' };
  const ageMs = Math.max(0, now - obs.measuredAt);
  let state: ReadingState = 'current';
  if (latest && latest.value === null && latest.measuredAt >= obs.measuredAt) state = 'missing';
  else if (ageMs > staleLimit(metric)) state = 'stale';
  return { obs, latest, ageMs, state };
}

/** Window of valid points for charts. */
export function windowOf(arr: Obs[], superseded: Set<string>, from: number, to: number): Obs[] {
  return arr.filter((o) => o.measuredAt >= from && o.measuredAt <= to && !superseded.has(o.id));
}
