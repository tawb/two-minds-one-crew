// View-model for the simple flow: the six vital cards and the clickable body regions.
// Flags use the SIMULATION PARAMETERS in params.ts. They are not clinical limits.

import type { SimState } from './engine';
import { SIM } from './params';
import { astro } from './crew';
import { isValid, lastValid, reading, seriesOf, type Reading, type ReadingState, type SeriesMap } from './selectors';
import type { Alert, Metric, Obs } from './types';

export type VitalKey = 'pulse' | 'bp' | 'temp' | 'glucose' | 'sleep' | 'air' | 'activity';
export type Flag = 'ok' | 'verify' | 'review' | 'none';
export type RegionId = 'head' | 'chest' | 'abdomen' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';

export interface Vital {
  key: VitalKey;
  label: string;
  unit: string;
  metric: Metric;
  subject: string;
  value: string | null; // display text of the last valid value
  flag: Flag;
  state: ReadingState;
  obs: Obs | null;
  ageMs: number | null;
  region: RegionId;
}

const META: Record<VitalKey, { label: string; unit: string; metric: Metric; region: RegionId }> = {
  pulse: { label: 'Heart rate', unit: 'bpm', metric: 'heart_rate', region: 'chest' },
  bp: { label: 'Blood pressure', unit: 'mmHg', metric: 'bp_systolic', region: 'leftArm' },
  temp: { label: 'Temperature', unit: '°C', metric: 'skin_temp', region: 'abdomen' },
  glucose: { label: 'Glucose', unit: 'mg/dL', metric: 'glucose', region: 'rightArm' },
  sleep: { label: 'Sleep', unit: 'h', metric: 'sleep', region: 'head' },
  air: { label: 'Cabin air (CO₂)', unit: 'ppm', metric: 'co2', region: 'head' },
  activity: { label: 'Activity', unit: '', metric: 'activity', region: 'leftLeg' },
};

export const CARD_ORDER: VitalKey[] = ['pulse', 'bp', 'temp', 'glucose', 'sleep', 'air'];

export interface RegionDef { id: RegionId; label: string; keys: VitalKey[]; symptoms: string[] }
export const REGIONS: Record<RegionId, RegionDef> = {
  head: { id: 'head', label: 'Head', keys: ['sleep', 'air'], symptoms: ['Headache', 'Dizziness', 'Blurred vision', 'Tiredness'] },
  chest: { id: 'chest', label: 'Chest', keys: ['pulse'], symptoms: ['Chest discomfort', 'Racing heart', 'Short of breath'] },
  abdomen: { id: 'abdomen', label: 'Abdomen', keys: ['temp'], symptoms: ['Nausea', 'Stomach pain', 'Feeling hot or cold'] },
  leftArm: { id: 'leftArm', label: 'Left arm', keys: ['bp'], symptoms: ['Pain', 'Numbness', 'Swelling'] },
  rightArm: { id: 'rightArm', label: 'Right arm', keys: ['glucose'], symptoms: ['Pain', 'Numbness', 'Patch irritation'] },
  leftLeg: { id: 'leftLeg', label: 'Left leg', keys: ['activity'], symptoms: ['Pain', 'Cramp', 'Swelling'] },
  rightLeg: { id: 'rightLeg', label: 'Right leg', keys: ['activity'], symptoms: ['Pain', 'Cramp', 'Swelling'] },
};

const rank = { none: -1, ok: 0, verify: 1, review: 2 } as const;
export const worse = (a: Flag, b: Flag): Flag => (rank[a] >= rank[b] ? a : b);

function flagFor(key: VitalKey, S: SimState, subject: string, val: Obs | null, dia: Obs | null): Flag {
  if (!val) return 'none';
  const T = SIM.thresholds;
  const v = Number(val.value);
  switch (key) {
    case 'pulse': {
      const act = lastValid(S.series, S.superseded, subject, 'activity');
      if (act?.value !== 'resting') return 'ok'; // a raised pulse while active is expected
      return v >= T.restingPulseReview ? 'review' : v >= T.restingPulseVerify ? 'verify' : 'ok';
    }
    case 'bp': {
      const d = Number(dia?.value ?? 0);
      return v >= T.bpReviewSys || d >= T.bpReviewDia ? 'review' : v >= T.bpVerifySys || d >= T.bpVerifyDia ? 'verify' : 'ok';
    }
    case 'temp': return v >= T.skinTempVerify ? 'verify' : 'ok';
    case 'glucose': return v <= T.glucoseReviewLow || v >= T.glucoseReviewHigh ? 'review' : v < T.glucoseLow || v > T.glucoseHigh ? 'verify' : 'ok';
    case 'sleep': return v < T.shortSleepH ? 'verify' : 'ok';
    case 'air': return v >= T.co2Review ? 'review' : v >= T.co2Verify ? 'verify' : 'ok';
    default: return 'ok';
  }
}

export function vital(S: SimState, aid: string, key: VitalKey): Vital {
  const m = META[key];
  const subject = key === 'air' ? astro(aid)!.moduleId : aid;
  const r: Reading = reading(S.series, S.superseded, S.now, subject, m.metric);
  const dia = key === 'bp' ? lastValid(S.series, S.superseded, subject, 'bp_diastolic') : null;
  let value: string | null = null;
  if (r.obs) value = key === 'bp' ? `${r.obs.value}/${dia?.value ?? '–'}` : String(r.obs.value);
  const flag = r.state === 'none' ? 'none' : flagFor(key, S, subject, r.obs, dia);
  return { key, label: m.label, unit: m.unit, metric: m.metric, subject, value, flag, state: r.state, obs: r.obs, ageMs: r.ageMs, region: m.region };
}

export const vitals = (S: SimState, aid: string) => CARD_ORDER.map((k) => vital(S, aid, k));

/** Open symptom reports tied to a body region. */
export function regionReports(S: SimState, aid: string, region: RegionId): Alert[] {
  return [...S.alerts.values()].filter(
    (a) => a.kind === 'symptom' && a.subjectId === aid && a.status === 'open' && S.byId.get(a.evidence[0])?.meta?.region === region,
  );
}

/** Marker on the body map: worst flag among the region's readings, or a report. */
export function regionFlag(S: SimState, aid: string, region: RegionId): { flag: Flag; reports: number; unavailable: boolean } {
  let flag: Flag = 'ok';
  let unavailable = false;
  for (const k of REGIONS[region].keys) {
    if (k === 'activity') continue;
    const v = vital(S, aid, k);
    flag = worse(flag, v.flag);
    if (v.state === 'missing') unavailable = true;
  }
  const reports = regionReports(S, aid, region).length;
  if (reports > 0) flag = worse(flag, 'verify');
  return { flag, reports, unavailable };
}

// ───────── comparison: now vs previous, on board vs on Earth ─────────

export interface Side {
  now: string | null; nowAt: number | null; nowId: string | null;
  prev: string | null; prevAt: number | null;
  delta: number | null; // numeric change (systolic for blood pressure)
}
export interface Comparison {
  key: VitalKey; label: string; unit: string; region: RegionId;
  board: Side; earth: Side;
  /** Earth's latest reading is older than the one on board (waiting to be delivered). */
  behind: boolean;
  earthReceivedAt: number | null;
}

const num = (o: { value: number | string | null } | null) => (o && typeof o.value === 'number' ? o.value : null);

function pickBefore(map: SeriesMap, sup: Set<string>, subject: string, metric: Metric, t: number) {
  const arr = seriesOf(map, subject, metric);
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].measuredAt <= t && isValid(arr[i]) && !sup.has(arr[i].id)) return arr[i];
  return null;
}

/** "Previous" = the reading taken at the previous Measure vitals session, or 30 minutes before the latest one. */
function side(map: SeriesMap, sup: Set<string>, aid: string, key: VitalKey, refTime: number | null): Side {
  const m = META[key];
  const subject = key === 'air' ? astro(aid)!.moduleId : aid;
  const now = lastValid(map, sup, subject, m.metric);
  const dia = key === 'bp' ? lastValid(map, sup, subject, 'bp_diastolic') : null;
  const text = (o: typeof now, d: typeof dia) => (o ? (key === 'bp' ? `${o.value}/${d?.value ?? '–'}` : String(o.value)) : null);
  if (!now) return { now: null, nowAt: null, nowId: null, prev: null, prevAt: null, delta: null };
  const ref = refTime !== null && refTime < now.measuredAt - 5_000 ? refTime : now.measuredAt - 30 * 60_000;
  const prev = pickBefore(map, sup, subject, m.metric, ref);
  const pdia = key === 'bp' && prev ? pickBefore(map, sup, subject, 'bp_diastolic', ref) : null;
  const a = num(now), b = num(prev);
  return {
    now: text(now, dia), nowAt: now.measuredAt, nowId: now.id,
    prev: text(prev, pdia), prevAt: prev?.measuredAt ?? null,
    delta: a !== null && b !== null ? Math.round((a - b) * 10) / 10 : null,
  };
}

export function compare(S: SimState, aid: string, key: VitalKey): Comparison {
  const log = S.measureLog[aid] ?? [];
  const ref = log.length >= 2 ? log[log.length - 2] : null;
  const m = META[key];
  const board = side(S.series, S.superseded, aid, key, ref);
  const earth = side(S.earthSeries, S.earthSuperseded, aid, key, ref);
  return {
    key, label: m.label, unit: m.unit, region: m.region, board, earth,
    behind: board.nowAt !== null && (earth.nowAt === null || earth.nowAt < board.nowAt),
    earthReceivedAt: earth.nowId ? S.earth.get(earth.nowId)?.receivedAt ?? null : null,
  };
}

export const compareAll = (S: SimState, aid: string) => CARD_ORDER.map((k) => compare(S, aid, k));

/** Change vs previous, for the small line on a vitals card. */
export function change(S: SimState, aid: string, key: VitalKey): { delta: number | null; prevAt: number | null } {
  const c = compare(S, aid, key);
  return { delta: c.board.delta, prevAt: c.board.prevAt };
}
