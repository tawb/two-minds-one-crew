import { CV_CONFIG } from '../config';
import type { RawSession, SessionSummary } from '../types';
import { median, round1 } from './stats';

/**
 * Turns the raw trial results into the numbers the rest of the feature uses.
 *
 *  lapse      no response, OR slower than max(lapseFloorMs, lapseMultiplier x the person's own typical time).
 *             The typical time is the personal baseline median if there is one, otherwise this session's own median.
 *             (The 500 ms PVT limit is for button presses and does not fit a camera-detected arm raise.)
 *
 *  total      planned trials (reaction trials + commands)
 *  completed  trials that were answered correctly and not discarded (a slow reaction is still completed)
 *  errors     wrong-gesture attempts + commands that were missed
 *  lapses     reaction trials that were too slow or had no response
 *  discarded  trials dropped for low confidence (reported, not scored)
 */
export function summarizeSession(raw: RawSession, opts: { referenceMs?: number | null } = {}): SessionSummary {
  const reactionValid = raw.reaction.filter((t) => !t.discarded && !t.skipped);
  const answered = reactionValid.filter((t) => t.reactionMs !== null);
  const cmdValid = raw.commands.filter((c) => !c.discarded && c.outcome !== 'skipped');
  const cmdCorrect = cmdValid.filter((c) => c.correct);

  const wrong = cmdValid.reduce((n, c) => n + c.wrongAttempts, 0);
  const missed = cmdValid.filter((c) => !c.correct).length;
  const withError = cmdValid.filter((c) => !c.correct || c.wrongAttempts > 0).length;
  const med = median(answered.map((t) => t.reactionMs as number));
  const r = CV_CONFIG.reaction;
  const reference = opts.referenceMs ?? med ?? 0;
  const lapseThresholdMs = Math.round(Math.max(r.lapseFloorMs, r.lapseMultiplier * reference));
  const lapses = reactionValid.filter((t) => t.lapse || (t.reactionMs !== null && t.reactionMs > lapseThresholdMs)).length;

  const cmdMed = median(cmdCorrect.map((c) => c.reactionMs as number));
  const speeds = cmdCorrect.map((c) => c.peakSpeedSwPerS).filter((v): v is number => v !== null);
  const smooth = cmdCorrect.map((c) => c.smoothness).filter((v): v is number => v !== null);

  return {
    medianReactionMs: med === null ? null : Math.round(med),
    commandMedianMs: cmdMed === null ? null : Math.round(cmdMed),
    completed: answered.length + cmdCorrect.length,
    total: raw.reaction.length + raw.commands.length,
    errors: wrong + missed,
    errorRate: cmdValid.length ? withError / cmdValid.length : 0,
    lapses,
    lapseRate: reactionValid.length ? lapses / reactionValid.length : 0,
    lapseThresholdMs,
    falseStarts: raw.reaction.reduce((n, t) => n + t.falseStarts, 0),
    validReaction: reactionValid.length,
    reactionAnswered: answered.length,
    validCommands: cmdValid.length,
    discarded: raw.reaction.filter((t) => t.discarded).length + raw.commands.filter((c) => c.discarded).length,
    skipped: raw.reaction.filter((t) => t.skipped).length + raw.commands.filter((c) => c.outcome === 'skipped').length,
    peakSpeedMedian: speeds.length ? round1(median(speeds) as number) : null,
    smoothnessMedian: smooth.length ? round1(median(smooth) as number) : null,
    frameIntervalMs: raw.frameIntervalMs === null ? null : round1(raw.frameIntervalMs),
  };
}
