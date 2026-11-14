import { CV_CONFIG } from '../config';
import type { CommandDef, CommandId, CommandResult, Detection, Frame, TrialOutcome } from '../types';
import { ALL_COMMAND_IDS } from './gestures';
import { movementMetrics, type Sample } from './geometry';
import { createOnset, stepOnset, type OnsetState } from './onset';
import { emptyRun, held, stepRun, type Run } from './stable';

/**
 * One command trial: wait for a neutral pose (hands down), show the cue, then watch for the correct gesture held
 * long enough to be sure (`stableFrames` frames and `stableMs`, forgiving a single dropped frame). Pure: feed it frames
 * with timestamps, get a new state back.
 *
 * reactionMs = cue -> the hand starts to move.  gestureMs = cue -> the correct gesture is first seen.
 * A wrong attempt is another command's gesture held for `wrongDwellMs`: hands pass through other gestures on the way.
 */
export interface CommandTrialState {
  command: CommandDef;
  phase: 'neutral' | 'cue' | 'done';
  startedAt: number;
  neutralRun: number;
  cueAt: number | null;
  run: Run;
  onset: OnsetState;
  wrongRun: Partial<Record<CommandId, number>>;
  wrongSince: Partial<Record<CommandId, number>>;
  wrongLatched: Partial<Record<CommandId, boolean>>;
  wrongAttempts: number;
  /** Diagnostic: frames in which each gesture was seen during the cue window. */
  seen: Partial<Record<CommandId, number>>;
  frames: number;
  poseLost: number;
  handMissing: number;
  samples: Sample[];
  outcome: TrialOutcome | null;
  reactionMs: number | null;
  gestureMs: number | null;
  confirmMs: number | null;
}

export function createCommandTrial(command: CommandDef, t: number): CommandTrialState {
  return {
    command, phase: 'neutral', startedAt: t, neutralRun: 0, cueAt: null, run: emptyRun(), onset: createOnset(),
    wrongRun: {}, wrongSince: {}, wrongLatched: {}, wrongAttempts: 0, seen: {}, frames: 0, poseLost: 0, handMissing: 0,
    samples: [], outcome: null, reactionMs: null, gestureMs: null, confirmMs: null,
  };
}

/** The UI calls this when the cue has actually been painted, so the clock starts when the person can see it. */
export function markCueShown(s: CommandTrialState, t: number): CommandTrialState {
  return s.phase === 'cue' && s.cueAt !== null && t > s.cueAt ? { ...s, cueAt: t } : s;
}

export function skipCommandTrial(s: CommandTrialState): CommandTrialState {
  return s.phase === 'done' ? s : { ...s, phase: 'done', outcome: 'skipped' };
}

export function stepCommandTrial(s: CommandTrialState, frame: Frame, det: Detection): CommandTrialState {
  if (s.phase === 'done') return s;
  const c = CV_CONFIG;

  if (s.phase === 'neutral') {
    const run = det.poseOk && det.handsDown ? s.neutralRun + 1 : 0;
    if (run >= c.neutralFrames) {
      return { ...s, phase: 'cue', neutralRun: run, cueAt: frame.t, run: emptyRun(), onset: stepOnset(createOnset(), frame.t, det.tracks, det.sw) };
    }
    if (frame.t - s.startedAt > c.commands.neutralTimeoutMs) return { ...s, phase: 'done', outcome: 'no-neutral', neutralRun: run };
    return { ...s, neutralRun: run };
  }

  // phase === 'cue'
  const next: CommandTrialState = { ...s, frames: s.frames + 1 };
  if (!det.poseOk) next.poseLost = s.poseLost + 1;
  if (s.command.kind === 'hand' && det.handsSeen === 0) next.handMissing = s.handMissing + 1;
  if (det.sw) next.samples = [...s.samples, { t: frame.t, sw: det.sw, pts: det.tracks }];
  next.onset = stepOnset(s.onset, frame.t, det.tracks, det.sw);

  const seen = { ...s.seen };
  for (const id of ALL_COMMAND_IDS) if (det.gestures[id]) seen[id] = (seen[id] ?? 0) + 1;
  next.seen = seen;

  // wrong-gesture attempts: another command's gesture held (frames AND time), counted once per entry
  const wrongRun = { ...s.wrongRun };
  const wrongSince = { ...s.wrongSince };
  const wrongLatched = { ...s.wrongLatched };
  let wrong = s.wrongAttempts;
  for (const id of ALL_COMMAND_IDS) {
    if (id === s.command.id) continue;
    if (det.gestures[id]) {
      wrongRun[id] = (wrongRun[id] ?? 0) + 1;
      wrongSince[id] = wrongSince[id] ?? frame.t;
      if ((wrongRun[id] ?? 0) >= c.commands.wrongFrames && frame.t - (wrongSince[id] as number) >= c.commands.wrongDwellMs && !wrongLatched[id]) {
        wrong++;
        wrongLatched[id] = true;
      }
    } else {
      wrongRun[id] = 0;
      delete wrongSince[id];
      wrongLatched[id] = false;
    }
  }
  next.wrongRun = wrongRun; next.wrongSince = wrongSince; next.wrongLatched = wrongLatched; next.wrongAttempts = wrong;

  next.run = stepRun(s.run, !!det.gestures[s.command.id], frame.t, c.stableGapFrames);
  if (held(next.run, frame.t, c.stableFrames, c.stableMs) && s.cueAt !== null) {
    const gestureT = next.run.since ?? frame.t;
    const moveT = Math.min(next.onset.onset ?? gestureT, gestureT);
    next.phase = 'done';
    next.outcome = 'correct';
    next.reactionMs = Math.max(0, moveT - s.cueAt);
    next.gestureMs = Math.max(0, gestureT - s.cueAt);
    next.confirmMs = Math.max(0, frame.t - s.cueAt);
  }

  if (next.phase === 'cue' && s.cueAt !== null && frame.t - s.cueAt > c.commands.timeoutMs) {
    next.phase = 'done';
    next.outcome = 'timeout';
  }
  return next;
}

/** Turn a finished trial into a result, applying the low-confidence discard rules. */
export function finalizeCommandTrial(s: CommandTrialState): CommandResult {
  const c = CV_CONFIG.commands;
  const outcome = s.outcome ?? 'timeout';
  const poseLostFraction = s.frames ? s.poseLost / s.frames : 0;
  const handMissingFraction = s.frames ? s.handMissing / s.frames : 0;
  let discardReason: string | null = null;
  if (outcome === 'no-neutral') discardReason = 'hands were not lowered before the cue';
  else if (outcome !== 'skipped' && poseLostFraction > c.poseLostDiscardFraction) discardReason = 'tracking was lost for too much of the trial';
  else if (outcome === 'timeout' && s.command.kind === 'hand' && handMissingFraction > c.handMissingDiscardFraction) discardReason = 'your hand was not visible to the camera';
  const discarded = discardReason !== null;
  const { peakSpeed, smoothness } = outcome === 'correct' ? movementMetrics(s.samples) : { peakSpeed: null, smoothness: null };
  return {
    id: s.command.id, kind: s.command.kind, outcome,
    correct: outcome === 'correct' && !discarded,
    reactionMs: outcome === 'correct' ? s.reactionMs : null,
    gestureMs: outcome === 'correct' ? s.gestureMs : null,
    confirmMs: outcome === 'correct' ? s.confirmMs : null,
    wrongAttempts: s.wrongAttempts,
    peakSpeedSwPerS: peakSpeed, smoothness,
    frames: s.frames, poseLostFraction, handMissingFraction,
    discarded, discardReason,
    diag: { peakRiseSw: Math.round(s.onset.maxRise * 100) / 100, seen: s.seen },
  };
}
