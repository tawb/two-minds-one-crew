// Exercise rules from NASA OCHMO-TB-031 (src/data/exerciseRules.json) and the maths for the "Protect your fitness" card.
// The card is a PROXY from logged minutes and lifts. It is not a VO2 test or a strength test.

import raw from '../data/exerciseRules.json';

export interface RuleSource { name: string; url: string; quote?: string; note?: string }
export interface Rule {
  id: string;
  label: string;
  text: string;
  values?: Record<string, number | number[]>;
  source: RuleSource | null;
  needsReview: boolean;
}

export const RULES: Rule[] = raw.rules as Rule[];
export const RULES_DOC = raw.document;

export const rule = (id: string): Rule => {
  const r = RULES.find((x) => x.id === id);
  if (!r) throw new Error(`exercise rule missing: ${id}`);
  return r;
};
const val = (id: string, key: string): number => {
  const v = rule(id).values?.[key];
  if (typeof v !== 'number') throw new Error(`exercise rule value missing: ${id}.${key}`);
  return v;
};
const range = (id: string, key: string): [number, number] => {
  const v = rule(id).values?.[key];
  if (!Array.isArray(v) || v.length !== 2) throw new Error(`exercise rule range missing: ${id}.${key}`);
  return [v[0], v[1]];
};

const DAY = 86_400_000;

// ───────────── numbers taken from the rules file ─────────────
export const NORMAL = {
  sessions: range('normal-week', 'sessionsPerWeek'),
  aerobicMin: val('normal-week', 'aerobicMinutesPerSession'),
  resistanceMin: range('normal-week', 'resistanceMinutesPerSession'),
};
/** Weekly minute targets: sessions per week (low end) x minutes per session. Arithmetic on sourced values. */
export const WEEKLY_TARGET = {
  aerobic: NORMAL.sessions[0] * NORMAL.aerobicMin,
  resistance: [NORMAL.sessions[0] * NORMAL.resistanceMin[0], NORMAL.sessions[1] * NORMAL.resistanceMin[1]] as [number, number],
};
export const DOSE = {
  sessions: val('minimum-dose', 'sessionsPerWeek'),
  minutesMoreThan: val('minimum-dose', 'minutesPerSessionMoreThan'),
  hrPctMoreThan: val('minimum-dose', 'maxHrPctMoreThan'),
};
export const ZONE = { minPct: val('aerobic-intensity', 'maxHrPctMin'), maxPct: val('aerobic-intensity', 'maxHrPctMax') };
export const PROTECT = { aerobic: val('protect-aerobic', 'minPctOfBaseline'), strength: val('protect-strength', 'minPctOfBaseline'), bone: val('protect-bone', 'minPctOfBaseline') };
export const HIGH_RISK_DROP_PCT = val('high-risk-drop', 'dropPct');
export const BASELINE_DAYS = val('proxy-baseline', 'baselineDays');

/** Maximum heart rate estimate. NEEDS REVIEW (rule max-hr-formula). */
export const maxHr = (age: number): number => val('max-hr-formula', 'base') - val('max-hr-formula', 'perYear') * age;
export const zoneBpm = (age: number): [number, number] => [Math.round((maxHr(age) * ZONE.minPct) / 100), Math.round((maxHr(age) * ZONE.maxPct) / 100)];

// ───────────── sessions ─────────────
export interface Lift { exercise: string; loadKg: number; sets: number; reps: number }
export interface ExerciseSession {
  id: string;
  subjectId: string;
  /** Simulated-clock time, ms. */
  at: number;
  kind: 'aerobic' | 'resistance';
  minutes: number;
  /** Average heart rate for an aerobic session, bpm. */
  avgHr?: number;
  lifts?: Lift[];
  simulated?: boolean;
}

export const liftVolume = (s: ExerciseSession): number => (s.lifts ?? []).reduce((v, l) => v + l.loadKg * l.sets * l.reps, 0);

/** Counts toward the minimum dose: aerobic, longer than 20 minutes, average heart rate above 70% of max. */
export function qualifies(s: ExerciseSession, age: number): boolean {
  return s.kind === 'aerobic' && s.minutes > DOSE.minutesMoreThan && s.avgHr !== undefined && s.avgHr > (maxHr(age) * DOSE.hrPctMoreThan) / 100;
}

export interface WeekStats { aerobicMin: number; resistanceMin: number; sessions: number; qualifying: number; liftVolume: number }

export function weekStats(all: ExerciseSession[], fromMs: number, toMs: number, age: number): WeekStats {
  const w = all.filter((s) => s.at > fromMs && s.at <= toMs);
  return {
    aerobicMin: w.filter((s) => s.kind === 'aerobic').reduce((a, s) => a + s.minutes, 0),
    resistanceMin: w.filter((s) => s.kind === 'resistance').reduce((a, s) => a + s.minutes, 0),
    sessions: w.length,
    qualifying: w.filter((s) => qualifies(s, age)).length,
    liftVolume: w.reduce((a, s) => a + liftVolume(s), 0),
  };
}

/** Weekly average of the first BASELINE_DAYS days of the log. null until a full baseline window exists before the current week. */
export function baselineStats(all: ExerciseSession[], nowMs: number, age: number): WeekStats | null {
  if (!all.length) return null;
  const first = Math.min(...all.map((s) => s.at));
  const end = first + BASELINE_DAYS * DAY;
  if (end > nowMs - 7 * DAY) return null; // the baseline window must finish before the week being judged
  const w = weekStats(all, first - 1, end - 1, age); // exactly BASELINE_DAYS days: [first, end)
  const weeks = BASELINE_DAYS / 7;
  return { aerobicMin: w.aerobicMin / weeks, resistanceMin: w.resistanceMin / weeks, sessions: w.sessions / weeks, qualifying: w.qualifying / weeks, liftVolume: w.liftVolume / weeks };
}

export type Risk = 'high' | 'ok' | 'unknown';

export interface Assessment {
  week: WeekStats;
  baseline: WeekStats | null;
  /** Percent of baseline, or null when there is no baseline. */
  aerobicPct: number | null;
  strengthPct: number | null;
  minutesPct: number | null;
  liftsPct: number | null;
  /** High when aerobic or strength dropped 20% or more (percent of baseline at or below 80). */
  risk: Risk;
  /** Which endpoints are at high risk. */
  atRisk: ('aerobic' | 'strength')[];
  /** Below the minimum dose: fewer than 3 qualifying sessions this week. */
  belowMinimumDose: boolean;
  /** Resistance minutes are zero: the "never drop to zero" rule applies. */
  volumeZero: boolean;
}

const pct = (now: number, base: number): number | null => (base > 0 ? (now / base) * 100 : null);

export function assess(all: ExerciseSession[], nowMs: number, age: number): Assessment {
  const week = weekStats(all, nowMs - 7 * DAY, nowMs, age);
  const baseline = baselineStats(all, nowMs, age);
  const aerobicPct = baseline ? pct(week.aerobicMin, baseline.aerobicMin) : null;
  const minutesPct = baseline ? pct(week.resistanceMin, baseline.resistanceMin) : null;
  const liftsPct = baseline ? pct(week.liftVolume, baseline.liftVolume) : null;
  const parts = [minutesPct, liftsPct].filter((x): x is number => x !== null);
  const strengthPct = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  const limit = 100 - HIGH_RISK_DROP_PCT; // a drop of 20% or more
  const atRisk: ('aerobic' | 'strength')[] = [];
  if (aerobicPct !== null && aerobicPct <= limit) atRisk.push('aerobic');
  if (strengthPct !== null && strengthPct <= limit) atRisk.push('strength');
  return {
    week, baseline, aerobicPct, strengthPct, minutesPct, liftsPct,
    risk: !baseline ? 'unknown' : atRisk.length ? 'high' : 'ok', atRisk,
    belowMinimumDose: week.qualifying < DOSE.sessions,
    volumeZero: week.resistanceMin === 0,
  };
}
