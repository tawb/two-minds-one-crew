import { CV_CONFIG } from '../config';
import type { Detection, Frame, PvtTrialResult } from '../types';
import type { Rng } from './commands';
import { createOnset, stepOnset, type OnsetState } from './onset';
import { emptyRun, held, stepRun, type Run } from './stable';

/**
 * PVT-style reaction round. Hands down -> random wait (2 to 5 s) -> visual cue -> raise either hand as fast as possible.
 *
 * A RESPONSE is registered the moment the hand has clearly lifted (a "raised hand" pose OR a clear lift toward the face
 * or head). It does NOT need to be held: people flick a hand up and drop it again when told to be fast.
 *  - raising a hand before the cue (or starting to move within `anticipationMs` after it) is a FALSE START: the trial restarts;
 *  - no response within `noResponseMs` is a LAPSE (no response). Slow responses are marked as lapses later, when the
 *    session is summarised, against the person's own typical time (see session.ts).
 * Reaction time is when the hand STARTS to move, minus the moment the cue was shown.
 */
export interface PvtState {
  phase: 'handsDown' | 'wait' | 'cue' | 'done';
  index: number;
  neutralRun: number;
  waitUntil: number;
  waitRaise: Run;
  cueAt: number | null;
  cueRaise: Run;
  onset: OnsetState;
  cueFrames: number;
  cueLost: number;
  /** Diagnostic: frames in the cue window in which a "raised hand" pose was seen. */
  cueRaisedFrames: number;
  falseStartsThisTrial: number;
  falseStartsTotal: number;
  trials: PvtTrialResult[];
}

export function createPvt(): PvtState {
  return {
    phase: 'handsDown', index: 0, neutralRun: 0, waitUntil: 0, waitRaise: emptyRun(), cueAt: null, cueRaise: emptyRun(),
    onset: createOnset(), cueFrames: 0, cueLost: 0, cueRaisedFrames: 0, falseStartsThisTrial: 0, falseStartsTotal: 0, trials: [],
  };
}

export function markPvtCueShown(s: PvtState, t: number): PvtState {
  return s.phase === 'cue' && s.cueAt !== null && t > s.cueAt ? { ...s, cueAt: t } : s;
}

type Rec = { reactionMs: number | null; gestureMs?: number | null; lapse: boolean; discarded: boolean; discardReason: string | null; skipped?: boolean };

function record(s: PvtState, r: Rec): PvtState {
  const trial: PvtTrialResult = {
    index: s.index, falseStarts: s.falseStartsThisTrial, skipped: false, gestureMs: null, ...r,
    diag: {
      peakRiseSw: Math.round(s.onset.maxRise * 100) / 100,
      raisedFrames: s.cueRaisedFrames,
      poseLostFraction: s.cueFrames ? Math.round((s.cueLost / s.cueFrames) * 100) / 100 : 0,
    },
  };
  const index = s.index + 1;
  return {
    ...s, trials: [...s.trials, trial], index, falseStartsThisTrial: 0, cueAt: null, cueRaise: emptyRun(), waitRaise: emptyRun(),
    onset: createOnset(), cueFrames: 0, cueLost: 0, cueRaisedFrames: 0, neutralRun: 0,
    phase: index >= CV_CONFIG.reaction.trials ? 'done' : 'handsDown',
  };
}

export function skipPvtTrial(s: PvtState): PvtState {
  if (s.phase === 'done') return s;
  return record(s, { reactionMs: null, lapse: false, discarded: false, discardReason: null, skipped: true });
}

export function stepPvt(s: PvtState, frame: Frame, det: Detection, rng: Rng): PvtState {
  const r = CV_CONFIG.reaction;
  if (s.phase === 'done') return s;

  if (s.phase === 'handsDown') {
    const run = det.poseOk && det.handsDown ? s.neutralRun + 1 : 0;
    if (run >= CV_CONFIG.neutralFrames) {
      const wait = r.waitMinMs + rng() * (r.waitMaxMs - r.waitMinMs);
      return { ...s, phase: 'wait', neutralRun: run, waitUntil: frame.t + wait, waitRaise: emptyRun() };
    }
    return { ...s, neutralRun: run };
  }

  if (s.phase === 'wait') {
    const waitRaise = stepRun(s.waitRaise, det.poseOk && det.anyRaised, frame.t, CV_CONFIG.stableGapFrames);
    if (waitRaise.count >= CV_CONFIG.stableFrames) return falseStart(s);
    if (frame.t >= s.waitUntil) {
      return { ...s, phase: 'cue', cueAt: frame.t, waitRaise, cueRaise: emptyRun(), cueFrames: 0, cueLost: 0, cueRaisedFrames: 0, onset: stepOnset(createOnset(), frame.t, det.tracks, det.sw) };
    }
    return { ...s, waitRaise };
  }

  // phase === 'cue'
  const cueAt = s.cueAt ?? frame.t;
  const raised = det.poseOk && det.anyRaised;
  const next: PvtState = {
    ...s, cueFrames: s.cueFrames + 1, cueLost: s.cueLost + (det.poseOk ? 0 : 1), cueRaisedFrames: s.cueRaisedFrames + (raised ? 1 : 0),
    onset: stepOnset(s.onset, frame.t, det.tracks, det.sw),
    cueRaise: stepRun(s.cueRaise, raised, frame.t, CV_CONFIG.stableGapFrames),
  };
  const lifted = next.onset.risenAt !== null; // hand clearly lifted (any height above where it started)
  const heldRaise = held(next.cueRaise, frame.t, CV_CONFIG.stableFrames, CV_CONFIG.stableMs);
  if (lifted || heldRaise) {
    const gestureT = Math.min(next.onset.risenAt ?? Infinity, next.cueRaise.since ?? Infinity, frame.t);
    const moveT = Math.min(next.onset.onset ?? gestureT, gestureT);
    const rt = Math.max(0, moveT - cueAt);
    if (rt < r.anticipationMs) return falseStart(next);
    return record(next, { reactionMs: rt, gestureMs: Math.max(0, gestureT - cueAt), lapse: false, discarded: false, discardReason: null });
  }
  if (frame.t - cueAt > r.noResponseMs) {
    const lost = next.cueFrames ? next.cueLost / next.cueFrames : 0;
    if (lost > r.poseLostDiscardFraction) {
      return record(next, { reactionMs: null, lapse: false, discarded: true, discardReason: 'tracking was lost during the trial' });
    }
    return record(next, { reactionMs: null, lapse: true, discarded: false, discardReason: null });
  }
  return next;
}

/** A hand went up too early: count it and start this trial over (a new random wait after the hand is lowered). */
function falseStart(s: PvtState): PvtState {
  const fs = s.falseStartsThisTrial + 1;
  const base: PvtState = {
    ...s, falseStartsThisTrial: fs, falseStartsTotal: s.falseStartsTotal + 1, phase: 'handsDown', neutralRun: 0,
    waitRaise: emptyRun(), cueRaise: emptyRun(), cueAt: null, onset: createOnset(), cueFrames: 0, cueLost: 0, cueRaisedFrames: 0,
  };
  if (fs >= CV_CONFIG.reaction.maxFalseStartsPerTrial) {
    return record(base, { reactionMs: null, lapse: false, discarded: true, discardReason: 'too many false starts' });
  }
  return base;
}
