import { describe, expect, it } from 'vitest';
import { addSession, allSessions, loadLogged, simulatedSessions } from './log';
import { assess, baselineStats, DOSE, HIGH_RISK_DROP_PCT, maxHr, NORMAL, PROTECT, qualifies, RULES, rule, WEEKLY_TARGET, zoneBpm, type ExerciseSession } from './rules';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 14);

describe('rules file', () => {
  it('every rule has a source with a link, or no source and needs review', () => {
    for (const r of RULES) {
      if (r.source) expect(r.source.url).toBe('https://www.nasa.gov/ochmo-tb-031-exercise-overview-2/');
      else expect(r.needsReview).toBe(true);
    }
  });
  it('the unsourced rules are marked needs review', () => {
    for (const id of ['recovery-day-intensity', 'trend-rule', 'safety-gate-wording', 'max-hr-formula', 'never-zero-volume', 'proxy-baseline']) expect(rule(id).needsReview).toBe(true);
  });
  it('the sourced rules carry a quote from the document and are not marked for review', () => {
    for (const id of ['normal-week', 'aerobic-intensity', 'minimum-dose', 'protect-aerobic', 'protect-strength', 'protect-bone', 'high-risk-drop', 'volume-drivers']) {
      expect(rule(id).needsReview).toBe(false);
      expect(rule(id).source?.quote?.length).toBeGreaterThan(10);
    }
  });
  it('holds the values from OCHMO-TB-031', () => {
    expect(NORMAL.sessions).toEqual([6, 7]);
    expect(NORMAL.aerobicMin).toBe(30);
    expect(NORMAL.resistanceMin).toEqual([30, 60]);
    expect(DOSE).toEqual({ sessions: 3, minutesMoreThan: 20, hrPctMoreThan: 70 });
    expect(PROTECT).toEqual({ aerobic: 80, strength: 80, bone: 95 });
    expect(HIGH_RISK_DROP_PCT).toBe(20);
    expect(WEEKLY_TARGET.aerobic).toBe(180);
    expect(WEEKLY_TARGET.resistance).toEqual([180, 420]);
  });
  it('max heart rate is 220 minus age and the zone is 70 to 90 percent of it', () => {
    expect(maxHr(40)).toBe(180);
    expect(zoneBpm(40)).toEqual([126, 162]);
  });
});

const s = (p: Partial<ExerciseSession> & Pick<ExerciseSession, 'kind' | 'at'>): ExerciseSession => ({ id: String(Math.random()), subjectId: 'A1', minutes: 30, ...p });

describe('minimum dose', () => {
  const age = 40; // max 180, 70% = 126
  it('needs more than 20 minutes and a heart rate above 70% of max (strictly)', () => {
    expect(qualifies(s({ kind: 'aerobic', at: 0, minutes: 21, avgHr: 130 }), age)).toBe(true);
    expect(qualifies(s({ kind: 'aerobic', at: 0, minutes: 20, avgHr: 130 }), age)).toBe(false);
    expect(qualifies(s({ kind: 'aerobic', at: 0, minutes: 30, avgHr: 126 }), age)).toBe(false);
    expect(qualifies(s({ kind: 'aerobic', at: 0, minutes: 30 }), age)).toBe(false);
    expect(qualifies(s({ kind: 'resistance', at: 0, minutes: 45, avgHr: 150 }), age)).toBe(false);
  });
  it('is below the dose with 2 qualifying sessions and met with 3', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => s({ kind: 'aerobic', at: NOW - i * DAY, minutes: 30, avgHr: 150 }));
    expect(assess(mk(2), NOW, age).belowMinimumDose).toBe(true);
    expect(assess(mk(3), NOW, age).belowMinimumDose).toBe(false);
  });
});

describe('proxy and the high-risk flag', () => {
  // baseline: 14 days at 30 aerobic + 45 resistance minutes and 3000 kg of lifts a day; then the week being judged
  const history = (frac: number) => {
    const out: ExerciseSession[] = [];
    for (let d = 28; d >= 0; d--) {
      const f = d <= 6 ? frac : 1;
      out.push(s({ kind: 'aerobic', at: NOW - d * DAY - 5 * 3_600_000, minutes: 30 * f, avgHr: 150 }));
      out.push(s({ kind: 'resistance', at: NOW - d * DAY - 4 * 3_600_000, minutes: 45 * f, lifts: [{ exercise: 'Squat', loadKg: 100 * f, sets: 3, reps: 10 }] }));
    }
    return out;
  };
  it('has no baseline until a full baseline window ends before the judged week', () => {
    expect(baselineStats([s({ kind: 'aerobic', at: NOW - 3 * DAY })], NOW, 40)).toBeNull();
    expect(assess([s({ kind: 'aerobic', at: NOW - 3 * DAY })], NOW, 40).risk).toBe('unknown');
  });
  it('100% of baseline is ok', () => {
    const a = assess(history(1), NOW, 40);
    expect(a.aerobicPct).toBeCloseTo(100, 5);
    expect(a.strengthPct).toBeCloseTo(100, 5);
    expect(a.risk).toBe('ok');
  });
  it('a 20% drop (80% of baseline) is the high-risk flag, 85% is not', () => {
    const at80 = assess(history(0.8), NOW, 40);
    expect(at80.aerobicPct).toBeCloseTo(80, 5);
    expect(at80.risk).toBe('high');
    expect(at80.atRisk).toEqual(['aerobic', 'strength']);
    expect(assess(history(0.85), NOW, 40).risk).toBe('ok');
  });
  it('strength proxy is the average of resistance minutes and logged lifts', () => {
    const base = history(1).filter((x) => x.at <= NOW - 7 * DAY);
    const week = history(1).filter((x) => x.at > NOW - 7 * DAY).map((x) => (x.kind === 'resistance' ? { ...x, minutes: x.minutes * 0.9, lifts: x.lifts!.map((l) => ({ ...l, loadKg: l.loadKg * 0.7 })) } : x));
    const a = assess([...base, ...week], NOW, 40);
    expect(a.minutesPct).toBeCloseTo(90, 5);
    expect(a.liftsPct).toBeCloseTo(70, 5);
    expect(a.strengthPct).toBeCloseTo(80, 5);
    expect(a.risk).toBe('high');
  });
  it('flags zero resistance volume so the never-drop-to-zero rule shows', () => {
    const a = assess(history(1).filter((x) => !(x.kind === 'resistance' && x.at > NOW - 7 * DAY)), NOW, 40);
    expect(a.volumeZero).toBe(true);
    expect(a.risk).toBe('high');
  });
});

describe('simulated crew history', () => {
  const a = (aid: string, age: number) => assess(simulatedSessions(aid, age, NOW), NOW, age);
  it('is deterministic and labelled simulated', () => {
    expect(simulatedSessions('A1', 42, NOW)).toEqual(simulatedSessions('A1', 42, NOW));
    expect(simulatedSessions('A1', 42, NOW).every((x) => x.simulated)).toBe(true);
  });
  it('shows a mix: on track, below the minimum dose, and a high-risk drop', () => {
    expect(a('A1', 42).risk).toBe('ok');
    expect(a('A1', 42).belowMinimumDose).toBe(false);
    expect(a('A2', 38).risk).toBe('ok');
    expect(a('A2', 38).belowMinimumDose).toBe(true);
    expect(a('A3', 45).risk).toBe('high');
  });
});

describe('logged sessions', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it('saves and adds to the history of that astronaut only', () => {
    const st = mem();
    addSession(s({ id: 'X1', kind: 'resistance', at: NOW - 1000, minutes: 40 }), st);
    expect(loadLogged(st)).toHaveLength(1);
    expect(allSessions('A1', 42, NOW, loadLogged(st)).some((x) => x.id === 'X1')).toBe(true);
    expect(allSessions('A2', 38, NOW, loadLogged(st)).some((x) => x.id === 'X1')).toBe(false);
  });
  it('survives missing or broken storage', () => {
    expect(() => addSession(s({ kind: 'aerobic', at: 0 }), null)).not.toThrow();
    expect(loadLogged(null)).toEqual([]);
    expect(loadLogged({ getItem: () => 'nope' })).toEqual([]);
  });
});
