import { describe, expect, it } from 'vitest';
import { suggest, worstPosition, type SuggestInput } from './suggest';
import { UNKNOWN_CONTEXT } from './types';

const ok = { state: 'calibrated' as const, lastCalibratedAt: null, daysSince: 3 };
const base = (p: Partial<SuggestInput> = {}): SuggestInput => ({ metric: 'heart_rate', position: 'within', quality: 'good', calibration: ok, context: { ...UNKNOWN_CONTEXT, posture: 'seated', minutesSinceExercise: 300 }, ...p });
const text = (i: SuggestInput) => suggest(i).lines.join(' ');

describe('suggestions', () => {
  it('tags and colours by position', () => {
    expect(suggest(base({ position: 'within' }))).toMatchObject({ tag: 'Normal', tone: 'ok' });
    expect(suggest(base({ position: 'above' }))).toMatchObject({ tag: 'High', tone: 'high' });
    expect(suggest(base({ position: 'below' }))).toMatchObject({ tag: 'Low', tone: 'low' });
    expect(suggest(base({ position: 'unknown' }))).toMatchObject({ tag: null, tone: 'info' });
  });
  it('high blood pressure: rest, with different text after exercise or when standing', () => {
    const bp = { metric: 'bp_systolic' as const, position: 'above' as const };
    expect(text(base(bp))).toContain('Sit and rest for 5 minutes');
    expect(text(base({ ...bp, context: { ...UNKNOWN_CONTEXT, posture: 'seated', minutesSinceExercise: 20 } }))).toContain('soon after exercise');
    expect(text(base({ ...bp, context: { ...UNKNOWN_CONTEXT, posture: 'standing', minutesSinceExercise: 300 } }))).toContain('Sit down');
  });
  it('low blood pressure: lie down or sit, drink water', () => {
    const t = text(base({ metric: 'bp_diastolic', position: 'below' }));
    expect(t).toContain('drink some water');
    expect(t).toContain('dizzy');
  });
  it('raised pulse right after exercise is called expected', () => {
    expect(text(base({ position: 'above', context: { ...UNKNOWN_CONTEXT, posture: 'seated', minutesSinceExercise: 10 } }))).toContain('expected soon after exercise');
  });
  it('glucose depends on the last meal', () => {
    const g = { metric: 'glucose' as const, position: 'above' as const };
    expect(text(base({ ...g, context: { ...UNKNOWN_CONTEXT, minutesSinceMeal: 40 } }))).toContain('after a meal');
    expect(text(base({ ...g, context: { ...UNKNOWN_CONTEXT, minutesSinceMeal: 600 } }))).toContain('Drink some water');
  });
  it('quality and calibration caveats come first', () => {
    expect(suggest(base({ position: 'above', quality: 'motion' })).lines[0]).toContain('while moving');
    expect(suggest(base({ position: 'above', quality: 'poor_fit' })).lines[0]).toContain('contact');
    const stale = suggest(base({ metric: 'bp_systolic', position: 'within', calibration: { ...ok, state: 'stale' } }));
    expect(stale.lines[0]).toContain('needs calibration');
    expect(suggest(base({ metric: 'heart_rate', position: 'within', calibration: { ...ok, state: 'stale' } })).lines.join()).not.toContain('calibration');
  });
  it('never states a diagnosis or a cause', () => {
    const all = (['heart_rate', 'bp_systolic', 'glucose'] as const).flatMap((metric) => (['above', 'below', 'within'] as const).map((position) => text(base({ metric, position }))));
    expect(all.join(' ').toLowerCase()).not.toMatch(/hypertens|hypotens|diabet|disease|because|caused by/);
  });
  it('picks the worst of several positions', () => {
    expect(worstPosition(['within', 'above'])).toBe('above');
    expect(worstPosition(['below', 'within'])).toBe('below');
    expect(worstPosition(['unknown', 'within'])).toBe('within');
    expect(worstPosition(['unknown'])).toBe('unknown');
  });
});

import { SimEngine } from '../sim/engine';
import { lastValid } from '../sim/selectors';
import { rangeOf } from './view';

describe('demo test readings', () => {
  const run = (bias: 'normal' | 'high' | 'low') => {
    const e = new SimEngine({ persist: null, online: () => true });
    e.loadScenario('routine'); e.S.ready = true;
    e.setDemoBias(bias);
    const pos: Record<string, string[]> = {};
    for (const aid of ['A1', 'A2', 'A3', 'A4']) {
      e.measureNow(aid);
      pos[aid] = (['heart_rate', 'bp_systolic', 'glucose'] as const).map((m) => rangeOf(e.S, aid, lastValid(e.S.series, e.S.superseded, aid, m), null)?.position ?? 'none');
    }
    return pos;
  };
  it('normal keeps every crew member inside the range', () => {
    expect(Object.values(run('normal')).flat().every((p) => p === 'within')).toBe(true);
  });
  it('high puts every crew member above the range for pulse, blood pressure and glucose', () => {
    expect(Object.values(run('high')).flat().every((p) => p === 'above')).toBe(true);
  });
  it('low puts every crew member below the range', () => {
    expect(Object.values(run('low')).flat().every((p) => p === 'below')).toBe(true);
  });
});

describe('test values and baselines', () => {
  it('sessions taken with test values do not count toward the personal baseline', () => {
    const e = new SimEngine({ persist: null, online: () => true });
    e.loadScenario('routine'); e.S.ready = true;
    e.setContext('A1', { posture: 'seated', exerciseAt: e.S.now - 6 * 3_600_000 });
    for (const b of ['high', 'low', 'high', 'low', 'high', 'low', 'high', 'low'] as const) { e.setDemoBias(b); e.measureNow('A1'); }
    e.setDemoBias('high'); e.measureNow('A1');
    const o = lastValid(e.S.series, e.S.superseded, 'A1', 'bp_systolic');
    const r = rangeOf(e.S, 'A1', o, null)!;
    expect(r.mode).toBe('population');
    expect(r.sessions).toBe(0);
    expect(r.position).toBe('above');
  });
});

describe('recommendations only for out-of-range vitals', () => {
  it('a normal reading gets a Normal tag, no line and no action', () => {
    const s = suggest(base({ position: 'within' }));
    expect(s).toMatchObject({ tag: 'Normal', lines: [], action: null });
  });
  it('every out-of-range vital has a card line and a short action', () => {
    for (const metric of ['heart_rate', 'bp_systolic', 'glucose'] as const) for (const position of ['above', 'below'] as const) {
      const s = suggest(base({ metric, position }));
      expect(s.lines.length).toBeGreaterThan(0);
      expect(s.action).toBeTruthy();
    }
    expect(suggest(base({ metric: 'sleep', position: 'below' })).action).toContain('early night');
    expect(suggest(base({ metric: 'skin_temp', position: 'above' })).action).toContain('drink some water');
  });
  it('uses the words from the brief: walk, rest, water, breathe, eat, flight surgeon', () => {
    const all = [
      suggest(base({ metric: 'glucose', position: 'above' })), suggest(base({ metric: 'glucose', position: 'below' })),
      suggest(base({ metric: 'heart_rate', position: 'above' })), suggest(base({ metric: 'bp_systolic', position: 'below' })),
    ].flatMap((s) => [...s.lines, s.action ?? '']).join(' ').toLowerCase();
    for (const w of ['walk', 'rest', 'water', 'breathe', 'eat something', 'flight surgeon']) expect(all).toContain(w);
  });
});

describe('random mix per measurement run', () => {
  const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const POS = (e: SimEngine, aid: string) => {
    const get = (m: Parameters<typeof lastValid>[3]) => rangeOf(e.S, aid, lastValid(e.S.series, e.S.superseded, aid, m), null)?.position;
    return { pulse: get('heart_rate'), bp: get('bp_systolic'), glucose: get('glucose'), temp: get('skin_temp'), sleep: get('sleep') };
  };
  const run = (seed: number, runs: number) => {
    const e = new SimEngine({ persist: null, online: () => true, mix: true, random: seeded(seed) });
    e.loadScenario('routine'); e.S.ready = true;
    e.setContext('A1', { posture: 'seated', exerciseAt: e.S.now - 6 * 3_600_000 });
    const out: ReturnType<typeof POS>[] = [];
    for (let i = 0; i < runs; i++) { e.measureNow('A1'); out.push(POS(e, 'A1')); }
    return out;
  };
  const off = (p: ReturnType<typeof POS>) => Object.values(p).filter((x) => x === 'above' || x === 'below').length;

  it('each run has 2 or 3 vitals out of range, the rest normal', () => {
    const runs = run(7, 30);
    for (const p of runs) {
      expect([2, 3]).toContain(off(p));
      expect(Object.values(p).filter((x) => x === 'within').length).toBe(5 - off(p));
    }
  });
  it('which vitals are off changes from run to run', () => {
    const sets = new Set(run(11, 30).map((p) => Object.entries(p).filter(([, v]) => v !== 'within').map(([k]) => k).join()));
    expect(sets.size).toBeGreaterThan(3);
  });
  it('the same seed gives the same runs, a different seed does not', () => {
    expect(run(5, 8)).toEqual(run(5, 8));
    expect(run(5, 8)).not.toEqual(run(6, 8));
  });
  it('low sleep is only low for the run that asked for it, and the original night is kept', () => {
    const e = new SimEngine({ persist: null, online: () => true, mix: true, random: seeded(3) });
    e.loadScenario('routine'); e.S.ready = true;
    const original = lastValid(e.S.series, e.S.superseded, 'A1', 'sleep')!;
    let sawLow = false, sawRestored = false;
    for (let i = 0; i < 25; i++) {
      e.measureNow('A1');
      const v = lastValid(e.S.series, e.S.superseded, 'A1', 'sleep')!;
      if (Number(v.value) < 6) sawLow = true;
      if (v.id === original.id || v.value === original.value) sawRestored = sawRestored || sawLow;
    }
    expect(sawLow).toBe(true);
    expect(sawRestored).toBe(true);
    expect(e.S.byId.get(original.id)?.value).toBe(original.value);
  });
  it('values stay plausible', () => {
    const e = new SimEngine({ persist: null, online: () => true, mix: true, random: seeded(21) });
    e.loadScenario('routine'); e.S.ready = true;
    for (let i = 0; i < 40; i++) {
      e.measureNow('A2');
      const v = (m: Parameters<typeof lastValid>[3]) => Number(lastValid(e.S.series, e.S.superseded, 'A2', m)!.value);
      expect(v('heart_rate')).toBeGreaterThanOrEqual(40); expect(v('heart_rate')).toBeLessThanOrEqual(115);
      expect(v('bp_systolic')).toBeGreaterThanOrEqual(84); expect(v('bp_systolic')).toBeLessThanOrEqual(162);
      expect(v('glucose')).toBeGreaterThanOrEqual(58); expect(v('glucose')).toBeLessThanOrEqual(188);
      expect(v('skin_temp')).toBeLessThanOrEqual(36.2);
      expect(v('sleep')).toBeGreaterThanOrEqual(4);
    }
  });
});
