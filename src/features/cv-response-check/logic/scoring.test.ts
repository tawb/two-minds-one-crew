import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CV_CONFIG } from '../config';
import { toEventDetail, buildReport, plainSummary } from './report';
import { loadLastResult, loadSessions, saveLastResult, saveSession, clearSessions } from '../storage';
import type { SessionSummary, StoredSession } from '../types';
import { scoreAgainstBaseline } from './baseline';
import { DISCLAIMER, decideStatus } from './status';
import { mad, median } from './stats';

const hist = (...ms: (number | null)[]): StoredSession[] =>
  ms.map((m, i) => ({ timestamp: i, medianReactionMs: m, commandMedianMs: 600, errorRate: 0, lapseRate: 0, state: 'normal' as const }));

const summary = (o: Partial<SessionSummary> = {}): SessionSummary => ({
  medianReactionMs: 600, commandMedianMs: 700, completed: 11, total: 11, errors: 0, errorRate: 0, lapses: 0, lapseRate: 0,
  lapseThresholdMs: 800, falseStarts: 0, validReaction: 5, reactionAnswered: 5, validCommands: 6, discarded: 0, skipped: 0, peakSpeedMedian: 3, smoothnessMedian: 1.2, frameIntervalMs: 33.3, ...o,
});

describe('baseline deviation scoring', () => {
  it('median and MAD', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(mad([600, 620, 610, 630, 605])).toBe(10);
  });

  it('is "calibrating, N of 3" before 3 sessions and gives no deviation', () => {
    for (const n of [0, 1, 2]) {
      const s = scoreAgainstBaseline(700, hist(...Array(n).fill(600)));
      expect(s.calibrating).toBe(true);
      expect(s.sessionsSoFar).toBe(n);
      expect(s.sessionsNeeded).toBe(3);
      expect(s.deviation).toBeNull();
    }
  });

  it('uses the astronaut\'s own median and MAD once there are 3 or more sessions', () => {
    const s = scoreAgainstBaseline(700, hist(600, 620, 610, 630, 605));
    expect(s.calibrating).toBe(false);
    expect(s.baselineMedianMs).toBe(610);
    // MAD-based spread (14.8) is below the 5% floor (30.5), so the floor applies: (700-610)/30.5
    expect(s.deviation).toBeCloseTo(2.95, 1);
    expect(s.percentChange).toBe(15);
    expect(scoreAgainstBaseline(500, hist(600, 620, 610)).deviation!).toBeLessThan(0); // faster than usual = negative
  });

  it('a noisier history means the same slowdown scores lower', () => {
    const steady = scoreAgainstBaseline(750, hist(600, 610, 605, 615, 600));
    const noisy = scoreAgainstBaseline(750, hist(450, 800, 520, 700, 600));
    expect(noisy.deviation!).toBeLessThan(steady.deviation!);
  });

  it('only the last 30 sessions count, and sessions without a value are ignored', () => {
    const old = Array(10).fill(2000);
    const recent = Array(30).fill(600);
    expect(scoreAgainstBaseline(600, hist(...old, ...recent)).baselineMedianMs).toBe(600);
    expect(scoreAgainstBaseline(600, hist(null, null, 600, 600, 600)).sessionsSoFar).toBe(3);
  });
});

describe('status decision', () => {
  const ready = (cur: number) => scoreAgainstBaseline(cur, hist(600, 620, 610, 630, 605));

  it('normal when speed, accuracy and lapses are in line', () => {
    const d = decideStatus(summary({ medianReactionMs: 615 }), ready(615));
    expect(d.state).toBe('normal');
    expect(d.reasons[0]).toMatch(/in line with your usual/);
    expect(d.disclaimer).toBe(DISCLAIMER);
  });

  it('watch when clearly slower than usual, with the reason in plain words', () => {
    const d = decideStatus(summary({ medianReactionMs: 690 }), ready(690));
    expect(d.state).toBe('watch');
    expect(d.reasons.join(' ')).toMatch(/percent slower than your usual/);
  });

  it('check-in suggested when far slower, or when accuracy collapses', () => {
    expect(decideStatus(summary({ medianReactionMs: 800 }), ready(800)).state).toBe('check-in suggested');
    expect(decideStatus(summary({ errorRate: 0.6, errors: 4 }), ready(615)).state).toBe('check-in suggested');
    expect(decideStatus(summary({ errorRate: 0.3, errors: 2 }), ready(615)).state).toBe('watch');
  });

  it('lapses raise the status', () => {
    expect(decideStatus(summary({ lapses: 2, lapseRate: 0.4 }), ready(615)).state).toBe('watch');
    expect(decideStatus(summary({ lapses: 3, lapseRate: 0.6 }), ready(615)).state).toBe('check-in suggested');
  });

  it('while calibrating it uses the placeholder bands, says so, and never goes above "watch"', () => {
    const b = scoreAgainstBaseline(1800, hist(600));
    const d = decideStatus(summary({ medianReactionMs: 1800 }), b);
    expect(d.calibrating).toBe(true);
    expect(d.state).toBe('watch');
    expect(d.baselineCount).toBe(2); // one on record plus this session
    expect(d.reasons.join(' ')).toMatch(/Calibrating: 2 of 3 baseline sessions/);
    const way = decideStatus(summary({ medianReactionMs: 3000 }), b);
    expect(way.state).toBe('watch'); // capped: no check-in suggestion from placeholder ranges
    expect(way.reasons.join(' ')).toMatch(/Held at "watch" while calibrating/);
    expect(decideStatus(summary({ medianReactionMs: 900 }), b).state).toBe('normal');
  });

  it('a normal camera-speed session (about 1 s) is not flagged while calibrating', () => {
    const b = scoreAgainstBaseline(1050, []);
    expect(decideStatus(summary({ medianReactionMs: 1050, lapses: 0 }), b).state).toBe('normal');
  });

  it('once calibrated, a personal baseline can still suggest a check-in', () => {
    const b = scoreAgainstBaseline(1500, hist(600, 620, 610));
    expect(decideStatus(summary({ medianReactionMs: 1500 }), b).state).toBe('check-in suggested');
  });

  it('too few valid trials is inconclusive (never a guess), and says why', () => {
    const d = decideStatus(summary({ validReaction: 2, validCommands: 1, discarded: 8 }), ready(615));
    expect(d.state).toBe('inconclusive');
    expect(d.reasons[0]).toMatch(/not enough to judge/);
  });

  it('no hand movement registered in ANY reaction trial is reported as a tracking problem, not a slow person', () => {
    const d = decideStatus(summary({ reactionAnswered: 0, lapses: 5, lapseRate: 1, medianReactionMs: null }), ready(615));
    expect(d.state).toBe('inconclusive');
    expect(d.reasons.join(' ')).toMatch(/tracking problem/);
    expect(d.reasons.join(' ')).not.toMatch(/lapses/);
    // but one missed trial out of five is still just a lapse
    expect(decideStatus(summary({ reactionAnswered: 4, lapses: 1, lapseRate: 0.2 }), ready(615)).state).toBe('normal');
  });

  it('never claims a diagnosis anywhere', () => {
    const states = [summary(), summary({ errorRate: 0.7 }), summary({ lapseRate: 0.8 }), summary({ validReaction: 0, validCommands: 0 })];
    const text = states.map((s) => { const d = decideStatus(s, ready(700)); return [...d.reasons, d.disclaimer, plainSummary(s, d)].join(' '); }).join(' ');
    expect(text).not.toMatch(/depress|anxiety|disorder|illness|disease|diagnosed with/i);
    expect(text).toMatch(/not a diagnosis/i);
  });
});

describe('report and event detail', () => {
  it('builds the integration payload with exactly the contract fields', () => {
    const b = scoreAgainstBaseline(690, hist(600, 620, 610, 630, 605));
    const d = decideStatus(summary({ medianReactionMs: 690, errors: 2, lapses: 1, falseStarts: 1 }), b);
    const detail = toEventDetail(summary({ medianReactionMs: 690, errors: 2, lapses: 1, falseStarts: 1 }), b, d, 1234);
    expect(Object.keys(detail).sort()).toEqual(['baselineDeviation', 'check', 'completed', 'errors', 'falseStarts', 'lapses', 'medianReactionMs', 'state', 'timestamp', 'total']);
    expect(detail.check).toBe('response');
    expect(detail.timestamp).toBe(1234);
    expect(detail.baselineDeviation).toBe(b.deviation);
  });

  it('the downloadable report holds numbers and text only: no landmarks, no images', () => {
    const b = scoreAgainstBaseline(600, hist(600, 600, 600));
    const d = decideStatus(summary(), b);
    const r = buildReport({ startedAt: 0, endedAt: 1, reaction: [{ index: 0, reactionMs: 300, gestureMs: 450, lapse: false, falseStarts: 0, discarded: false, discardReason: null, skipped: false, diag: { peakRiseSw: 1.2, raisedFrames: 6, poseLostFraction: 0 } }], commands: [], frameIntervalMs: 33 }, summary(), b, d, 5);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/landmark|data:image|blob:/i);
    expect(JSON.parse(json).check).toBe('response');
    expect(r.timingResolutionMs).toBe(33.3);
  });
});

describe('storage (numbers only, never throws)', () => {
  const mem = new Map<string, string>();
  let failing = false;
  beforeEach(() => {
    mem.clear(); failing = false;
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => { if (failing) throw new Error('blocked'); return mem.get(k) ?? null; },
      setItem: (k: string, v: string) => { if (failing) throw new Error('full'); mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    } as unknown as Storage;
  });
  afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

  it('keeps only the last 30 sessions per astronaut', () => {
    for (let i = 0; i < 35; i++) saveSession('A1', hist(600 + i)[0]);
    const s = loadSessions('A1');
    expect(s).toHaveLength(CV_CONFIG.baseline.maxSessions);
    expect(s[s.length - 1].medianReactionMs).toBe(634);
    expect(loadSessions('A2')).toEqual([]);
    clearSessions('A1');
    expect(loadSessions('A1')).toEqual([]);
  });

  it('survives blocked or full storage, and corrupt data', () => {
    failing = true;
    expect(saveSession('A1', hist(600)[0])).toBe(false);
    expect(loadSessions('A1')).toEqual([]);
    failing = false;
    mem.set('cv-response-check:v1:sessions:A1', '{not json');
    expect(loadSessions('A1')).toEqual([]);
    expect(saveLastResult('A1', { check: 'response', state: 'normal', medianReactionMs: 1, baselineDeviation: null, completed: 1, total: 1, errors: 0, lapses: 0, falseStarts: 0, timestamp: 1 })).toBe(true);
    expect(loadLastResult('A1')?.state).toBe('normal');
  });
});
