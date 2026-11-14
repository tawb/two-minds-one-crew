import { CV_CONFIG } from '../config';
import type { ResponseState, SessionSummary } from '../types';
import type { BaselineScore } from './baseline';

export const DISCLAIMER = 'This is not a diagnosis. Tiredness, poor sleep or lighting can affect it.';

export interface StatusDecision {
  state: ResponseState;
  reasons: string[];
  disclaimer: string;
  calibrating: boolean;
  /** Baseline sessions on record INCLUDING this one (if it produced a reaction time). */
  baselineCount: number;
}

const pct = (v: number) => `${Math.round(v * 100)} percent`;

/**
 * Decide "normal", "watch" or "check-in suggested" from the baseline deviation plus error and lapse rates.
 * "inconclusive" is used when too few trials were valid to decide. The reasons are written for the astronaut.
 * Every threshold is in CV_CONFIG and flagged TODO(flight-surgeon).
 */
export function decideStatus(s: SessionSummary, b: BaselineScore): StatusDecision {
  const c = CV_CONFIG.status;
  const reasons: string[] = [];
  const calibrating = b.calibrating;
  const baselineCount = b.sessionsSoFar + (s.medianReactionMs !== null ? 1 : 0);
  const valid = s.validReaction + s.validCommands;

  if (valid < c.minValidTrials) {
    reasons.push(`Only ${valid} trial${valid === 1 ? '' : 's'} could be measured reliably${s.discarded ? ` (${s.discarded} discarded)` : ''}, so there is not enough to judge. Try again with better lighting and both hands in view.`);
    return { state: 'inconclusive', reasons, disclaimer: DISCLAIMER, calibrating, baselineCount };
  }

  // Not one reaction trial registered a hand movement. An awake person always moves, so this is a tracking problem
  // (lighting, wrist out of view, camera angle), not a slow response. Say so instead of scoring it.
  if (s.validReaction >= 3 && s.reactionAnswered === 0) {
    reasons.push('The camera did not register a hand movement in any reaction trial. That looks like a tracking problem, not a slow response. Check that the room is lit, that your whole arm and hand are in view when you raise it, and that you are not too far from the camera, then try again. The "Trial by trial" table shows how high your hand got.');
    return { state: 'inconclusive', reasons, disclaimer: DISCLAIMER, calibrating, baselineCount };
  }

  let level = 0; // 0 normal, 1 watch, 2 check-in suggested
  const raise = (l: number) => { level = Math.max(level, l); };

  // reaction speed
  if (s.medianReactionMs !== null) {
    if (!calibrating && b.deviation !== null && b.percentChange !== null) {
      if (b.deviation >= c.checkInZ) raise(2); else if (b.deviation >= c.watchZ) raise(1);
      if (b.deviation >= c.watchZ) reasons.push(`Reaction ${Math.abs(b.percentChange)} percent slower than your usual (${s.medianReactionMs} ms against ${b.baselineMedianMs} ms).`);
    } else {
      const p = CV_CONFIG.placeholderBands;
      if (s.medianReactionMs > p.reactionWatchMaxMs) raise(2); else if (s.medianReactionMs > p.reactionNormalMaxMs) raise(1);
      if (s.medianReactionMs > p.reactionNormalMaxMs) reasons.push(`Reaction ${s.medianReactionMs} ms is above the placeholder range used until your own baseline is ready.`);
    }
  }
  // accuracy
  if (s.errorRate >= c.checkInErrorRate) raise(2); else if (s.errorRate >= c.watchErrorRate) raise(1);
  if (s.errorRate >= c.watchErrorRate) reasons.push(`${pct(s.errorRate)} of commands had a wrong or missed response.`);
  // lapses
  if (s.lapseRate >= c.checkInLapseRate) raise(2); else if (s.lapseRate >= c.watchLapseRate) raise(1);
  if (s.lapseRate >= c.watchLapseRate) reasons.push(`${s.lapses} of ${s.validReaction} reaction trials were lapses (no response, or slower than ${s.lapseThresholdMs} ms, which is unusually slow for you).`);
  // information only
  if (s.falseStarts > 0) reasons.push(`${s.falseStarts} false start${s.falseStarts === 1 ? '' : 's'} (raised a hand before the signal).`);
  if (s.discarded > 0) reasons.push(`${s.discarded} trial${s.discarded === 1 ? ' was' : 's were'} discarded because the camera could not track you reliably.`);

  // Before there is a personal baseline the placeholder ranges are not a reason to suggest a check-in.
  if (calibrating && level > c.calibratingMaxLevel) {
    level = c.calibratingMaxLevel;
    reasons.push('Held at "watch" while calibrating: a check-in is only suggested once your own baseline exists.');
  }
  const state: ResponseState = level === 2 ? 'check-in suggested' : level === 1 ? 'watch' : 'normal';
  if (state === 'normal') reasons.unshift(calibrating ? 'Nothing unusual against the placeholder ranges.' : 'Response speed and accuracy are in line with your usual.');
  if (calibrating) reasons.push(`Calibrating: ${Math.min(baselineCount, b.sessionsNeeded)} of ${b.sessionsNeeded} baseline sessions. This session counts. Your own normal is used once there are ${b.sessionsNeeded}.`);
  return { state, reasons, disclaimer: DISCLAIMER, calibrating, baselineCount };
}
