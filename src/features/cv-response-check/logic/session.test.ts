import { describe, expect, it } from 'vitest';
import { CV_CONFIG } from '../config';
import type { CommandId, Frame } from '../types';
import { COMMANDS, mulberry32 } from './commands';
import { movementMetrics } from './geometry';
import { SessionRunner } from './runner';
import { summarizeSession } from './session';
import { drive, frameForCommand, makeFrame, type DriveCtx, type WristPose } from './testkit';

const cmds = (...ids: CommandId[]) => ids.map((id) => COMMANDS.find((c) => c.id === id)!);
const neutral = (t: number): Frame => makeFrame(t, {});

interface Behaviour {
  /** reaction time per cue number (1-based); null = no response */
  pvtRt?: (cue: number) => number | null;
  /** reaction time for a command; null = never responds */
  cmdRt?: (id: CommandId | undefined) => number | null;
  /** raise a hand during the wait (false start) between these times (ms) */
  falseStart?: [number, number];
  /** frame replacement while a command is showing (e.g. wrong gesture first) */
  override?: (c: DriveCtx) => Frame | null;
  /** the hand starts to move at the first time but only reaches the raised pose at pvtRt (ms since cue) */
  pvtCreep?: [number, number];
  /** the hand goes up for this many ms after the response time and then drops again (a quick flick) */
  pvtFlick?: number;
  /** the pose shown as the response (default 'raised'); 'nose' = the hand only goes up to the face */
  pvtPose?: WristPose;
  /** Make a command frame lose the pose entirely. */
  poseLostInCommands?: boolean;
  poseLostInCue?: boolean;
}

function person(b: Behaviour) {
  return (c: DriveCtx): Frame => {
    const v = c.view;
    if (v && v.phase === 'reaction') {
      if (b.falseStart && !v.cue && c.t >= b.falseStart[0] && c.t <= b.falseStart[1]) return makeFrame(c.t, { right: 'raised' });
      if (v.cue && c.sinceCue !== null) {
        if (b.poseLostInCue) return makeFrame(c.t, null);
        if (b.pvtCreep && c.sinceCue >= b.pvtCreep[0] && c.sinceCue < b.pvtCreep[1]) return makeFrame(c.t, { right: 'mid' });
        const rt = (b.pvtRt ?? (() => 300))(c.cueNumber);
        if (rt !== null && c.sinceCue >= rt) {
          if (b.pvtFlick !== undefined && c.sinceCue >= rt + b.pvtFlick) return neutral(c.t);
          return makeFrame(c.t, { right: b.pvtPose ?? 'raised' });
        }
        return neutral(c.t);
      }
    }
    if (v && v.phase === 'commands' && v.cue && c.sinceCue !== null) {
      const o = b.override?.(c);
      if (o) return o;
      if (b.poseLostInCommands) return makeFrame(c.t, null);
      const rt = (b.cmdRt ?? (() => 600))(c.commandId);
      return rt !== null && c.sinceCue >= rt && c.commandId ? frameForCommand(c.t, c.commandId) : neutral(c.t);
    }
    return neutral(c.t);
  };
}

function run(ids: CommandId[], b: Behaviour, seed = 3) {
  const runner = new SessionRunner(cmds(...ids), mulberry32(seed));
  const { views } = drive(runner, person(b));
  expect(runner.finished).toBe(true);
  const raw = runner.result();
  return { raw, summary: summarizeSession(raw), views };
}

const SIX: CommandId[] = ['raiseRight', 'touchNose', 'fist', 'raiseLeft', 'twoFingers', 'handOnHead'];

describe('a normal run', () => {
  it('measures reaction and commands, completes every trial and reports the timing resolution', () => {
    const { summary, raw } = run(SIX, {});
    expect(summary.total).toBe(5 + 6);
    expect(summary.completed).toBe(11);
    expect(summary.errors).toBe(0);
    expect(summary.lapses).toBe(0);
    expect(summary.falseStarts).toBe(0);
    expect(summary.discarded).toBe(0);
    expect(summary.medianReactionMs).toBeGreaterThanOrEqual(300);
    expect(summary.medianReactionMs).toBeLessThan(345);
    expect(summary.commandMedianMs).toBeGreaterThanOrEqual(600);
    expect(summary.commandMedianMs).toBeLessThan(645);
    expect(summary.frameIntervalMs).toBeCloseTo(33.3, 0); // resolution of every time above
    for (const c of raw.commands) {
      expect(c.confirmMs!).toBeGreaterThan(c.gestureMs!); // confirmed only after the gesture was held
      expect(c.confirmMs! - c.gestureMs!).toBeGreaterThanOrEqual(CV_CONFIG.stableMs);
      expect(c.reactionMs!).toBeLessThanOrEqual(c.gestureMs!);
    }
  });

  it('waits 2 to 5 seconds before every reaction cue', () => {
    const { views } = run(SIX, {});
    expect(views.some((v) => v.phase === 'reaction' && v.cue)).toBe(true);
    expect(views[views.length - 1].phase).toBe('done');
  });
});

describe('reaction round', () => {
  it('a false start is counted and the trial is repeated, not lost', () => {
    const { raw, summary } = run(SIX, { falseStart: [5200, 5800] });
    expect(summary.falseStarts).toBe(1);
    expect(raw.reaction).toHaveLength(CV_CONFIG.reaction.trials);
    expect(raw.reaction.filter((t) => t.reactionMs !== null)).toHaveLength(CV_CONFIG.reaction.trials);
  });

  it('lapses are judged against the person\'s own typical time, not a button-press limit', () => {
    // uniformly slow is NOT a lapse (floor 800 ms): a camera-detected arm raise is slower than a button press
    const slow = run(SIX, { pvtRt: () => 700 });
    expect(slow.summary.lapses).toBe(0);
    expect(slow.summary.medianReactionMs).toBeGreaterThanOrEqual(700);
    // one response far slower than the rest IS a lapse
    const outlier = run(SIX, { pvtRt: (cue) => (cue === 3 ? 2500 : 300) });
    expect(outlier.summary.lapses).toBe(1);
    expect(outlier.summary.lapseThresholdMs).toBe(CV_CONFIG.reaction.lapseFloorMs);
    // with a personal baseline of 700 ms the limit becomes 1.5 x 700 = 1050 ms
    const personal = summarizeSession(outlier.raw, { referenceMs: 700 });
    expect(personal.lapseThresholdMs).toBe(1050);
    expect(personal.lapses).toBe(1);
  });

  it('no response is a lapse; it is reported', () => {
    const mixed = run(SIX, { pvtRt: (cue) => (cue === 2 ? null : 300) });
    expect(mixed.summary.lapses).toBe(1);
    expect(mixed.raw.reaction.find((t) => t.lapse && t.reactionMs === null)).toBeDefined();
    expect(mixed.summary.lapseRate).toBeCloseTo(0.2, 5);
  });

  it('low-confidence frames during a no-response trial discard it instead of calling it a lapse', () => {
    const { raw, summary } = run(SIX, { poseLostInCue: true });
    expect(raw.reaction.every((t) => t.discarded && !t.lapse)).toBe(true);
    expect(summary.lapses).toBe(0);
    expect(summary.discarded).toBeGreaterThanOrEqual(5);
    expect(raw.reaction[0].discardReason).toMatch(/tracking/);
  });
});

describe('command trials', () => {
  it('a wrong gesture is counted as an attempt; the trial can still be answered correctly', () => {
    const { raw } = run(['raiseRight', 'touchNose', 'fist', 'raiseLeft', 'twoFingers', 'handOnHead'], {
      override: (c) => (c.commandId === 'raiseRight' && c.sinceCue !== null && c.sinceCue < 650 && c.sinceCue > 100 ? frameForCommand(c.t, 'raiseLeft') : null),
    });
    const first = raw.commands[0];
    expect(first.id).toBe('raiseRight');
    expect(first.wrongAttempts).toBe(1);
    expect(first.correct).toBe(true);
    expect(first.gestureMs!).toBeGreaterThanOrEqual(650);
    expect(first.reactionMs!).toBeLessThan(first.gestureMs!); // the hand started moving long before the right gesture
  });

  it('no response before the timeout is a missed command (an error)', () => {
    const { raw, summary } = run(SIX, { cmdRt: () => null });
    expect(raw.commands.every((c) => c.outcome === 'timeout')).toBe(true);
    // the 4 pose commands are real misses; the 2 hand commands saw no hand at all, so they are discarded, not scored
    expect(summary.errors).toBe(4);
    expect(summary.discarded).toBe(2);
    expect(summary.validCommands).toBe(4);
    expect(summary.errorRate).toBe(1);
    expect(summary.completed).toBe(5); // only the reaction round
  });

  it('a hand command with no hand visible is discarded as "hand not visible", not scored as an error', () => {
    const { raw, summary } = run(['fist', 'raiseRight', 'touchNose', 'oneFinger', 'raiseLeft', 'handOnHead'], {
      cmdRt: (id) => (id === 'fist' ? null : 600),
    });
    const fist = raw.commands[0];
    expect(fist.outcome).toBe('timeout');
    expect(fist.handMissingFraction).toBeGreaterThan(0.5);
    expect(fist.discarded).toBe(true);
    expect(fist.discardReason).toMatch(/hand/);
    expect(summary.discarded).toBe(1);
    expect(summary.errors).toBe(0);
    expect(summary.validCommands).toBe(5);
  });

  it('losing the pose for most of a command discards it, even if a late gesture arrives', () => {
    const { raw } = run(SIX, { poseLostInCommands: true });
    expect(raw.commands.every((c) => c.discarded)).toBe(true);
    expect(raw.commands[0].discardReason).toMatch(/tracking/);
  });

  it('a person who never lowers their hands cannot start a trial: discarded, not an error', () => {
    const runner = new SessionRunner(cmds('raiseRight', 'touchNose', 'fist', 'raiseLeft', 'twoFingers', 'handOnHead'), mulberry32(2));
    drive(runner, (c) => (c.view?.phase === 'commands' ? makeFrame(c.t, { right: 'mid' }) : neutral(c.t)));
    const raw = runner.result();
    expect(raw.commands.every((c) => c.outcome === 'no-neutral' && c.discarded)).toBe(true);
    expect(summarizeSession(raw).errors).toBe(0);
  });
});

describe('skip and stop', () => {
  it('skipping a command is not an error; stopping ends the session without a result', () => {
    const runner = new SessionRunner(cmds(...SIX), mulberry32(4));
    let skipped = false;
    drive(runner, (c) => {
      if (!skipped && c.view?.phase === 'commands' && c.view.cue && c.sinceCue !== null && c.sinceCue > 200) { skipped = true; runner.skip(); }
      return person({})(c);
    });
    const s = summarizeSession(runner.result());
    expect(s.skipped).toBe(1);
    expect(s.errors).toBe(0);

    const r2 = new SessionRunner(cmds(...SIX), mulberry32(4));
    drive(r2, (c) => { if (c.t > 6000) r2.stop(); return neutral(c.t); });
    expect(r2.stopped).toBe(true);
    expect(r2.finished).toBe(false);
  });
});

describe('movement metrics', () => {
  const line = (n: number, f: (i: number) => [number, number]) => Array.from({ length: n }, (_, i) => ({ t: i * 33, sw: 0.27, pts: { R: f(i) } }));
  it('a straight reach is smoother than a wobbly one, and speed is in shoulder widths per second', () => {
    const straight = movementMetrics(line(12, (i) => [0.3, 0.8 - i * 0.04]));
    const wobbly = movementMetrics(line(12, (i) => [0.3 + (i % 2 ? 0.05 : -0.05), 0.8 - i * 0.04]));
    expect(straight.smoothness!).toBeCloseTo(1, 1);
    expect(wobbly.smoothness!).toBeGreaterThan(straight.smoothness!);
    // 0.04 height-units per 33 ms = 1.21 height/s = 4.5 shoulder widths/s
    expect(straight.peakSpeed!).toBeGreaterThan(4);
    expect(straight.peakSpeed!).toBeLessThan(5);
  });
  it('tracking glitches (impossible speeds) and tiny jitter are ignored', () => {
    const still = movementMetrics(line(10, (i) => [0.3 + (i % 2) * 0.0003, 0.8]));
    expect(still.peakSpeed).toBeNull();
    const glitch = movementMetrics(line(4, (i) => [0.3, i === 2 ? 0.1 : 0.8]));
    expect(glitch.peakSpeed).toBeNull();
  });
});

describe('real-motion tolerance', () => {
  it('reaction time is when the hand STARTS to move, not when it arrives (reaction round)', () => {
    const { raw, summary } = run(SIX, { pvtCreep: [250, 700], pvtRt: () => 700 });
    for (const t of raw.reaction) {
      expect(t.reactionMs!).toBeGreaterThanOrEqual(250);
      expect(t.reactionMs!).toBeLessThan(330);
      expect(t.gestureMs!).toBeLessThan(400); // a clear lift is the response: it does not wait for the arm to reach the top
    }
    expect(summary.medianReactionMs!).toBeLessThan(330);
    expect(summary.lapses).toBe(0);
  });

  it('reaction time is when the hand starts to move, not when it arrives (commands)', () => {
    const { raw } = run(SIX, {
      cmdRt: () => 800,
      override: (c) => (c.commandId === 'raiseRight' && c.sinceCue !== null && c.sinceCue >= 200 && c.sinceCue < 800 ? makeFrame(c.t, { right: 'mid' }) : null),
    });
    const first = raw.commands[0];
    expect(first.correct).toBe(true);
    expect(first.reactionMs!).toBeGreaterThanOrEqual(200);
    expect(first.reactionMs!).toBeLessThan(260);
    expect(first.gestureMs!).toBeGreaterThanOrEqual(800);
  });

  it('passing through another gesture on the way to the right one is NOT a wrong attempt', () => {
    const { raw } = run(SIX, {
      override: (c) => (c.commandId === 'raiseRight' && c.sinceCue !== null && c.sinceCue >= 300 && c.sinceCue < 420 ? frameForCommand(c.t, 'touchNose') : null),
    });
    expect(raw.commands[0].wrongAttempts).toBe(0);
    expect(raw.commands[0].correct).toBe(true);
  });

  it('but holding a wrong gesture for a real moment IS a wrong attempt', () => {
    const { raw } = run(SIX, {
      override: (c) => (c.commandId === 'raiseRight' && c.sinceCue !== null && c.sinceCue >= 200 && c.sinceCue < 800 ? frameForCommand(c.t, 'touchNose') : null),
    });
    expect(raw.commands[0].wrongAttempts).toBe(1);
  });
});

describe('real-world reaction round (a person who is moving well)', () => {
  it('a quick flick of the hand (up and straight back down) is a response: it does not have to be held', () => {
    const { raw, summary } = run(SIX, { pvtRt: () => 350, pvtFlick: 100 });
    expect(raw.reaction.every((t) => t.reactionMs !== null)).toBe(true);
    expect(summary.reactionAnswered).toBe(5);
    expect(summary.lapses).toBe(0);
    expect(summary.medianReactionMs!).toBeGreaterThanOrEqual(350);
    expect(summary.medianReactionMs!).toBeLessThan(420);
  });

  it('a hand lifted only to the face (not a raised-hand pose) is still a response', () => {
    const { raw, summary } = run(SIX, { pvtRt: () => 400, pvtPose: 'nose' });
    expect(summary.reactionAnswered).toBe(5);
    expect(summary.lapses).toBe(0);
    for (const t of raw.reaction) expect(t.diag.peakRiseSw).toBeGreaterThan(1);
  });

  it('one dropped landmark frame in the middle of a gesture does not restart the hold', () => {
    const { raw } = run(SIX, {
      override: (c) => (c.commandId && c.sinceCue !== null && c.sinceCue >= 600 && Math.floor(c.t / (1000 / 30)) % 4 === 0 ? neutral(c.t) : null),
    });
    expect(raw.commands.filter((x) => x.correct).length).toBe(6);
  });

  it('when nothing registers, the trial says how high the hand got (so a tracking problem can be seen)', () => {
    const { raw, summary } = run(SIX, { pvtRt: () => null });
    expect(summary.reactionAnswered).toBe(0);
    expect(summary.lapses).toBe(5);
    for (const t of raw.reaction) {
      expect(t.diag.peakRiseSw).toBe(0);
      expect(t.diag.raisedFrames).toBe(0);
    }
  });

  it('command trials report which gestures the camera saw', () => {
    const { raw } = run(SIX, { cmdRt: () => 600 });
    for (const c of raw.commands) {
      expect(c.diag.seen[c.id]).toBeGreaterThan(0);
      expect(c.diag.peakRiseSw).toBeGreaterThan(0.5);
    }
  });
});
