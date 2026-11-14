import { CV_CONFIG } from '../config';
import type { XY } from '../types';
import { dist } from './geometry';

/**
 * Movement tracker. Remembers where each wrist was at the cue and reports
 *  - ONSET: the first moment either wrist has moved clearly away and stayed away for a couple of frames (this is the
 *    reaction time, so the time the arm needs to travel does not count), and
 *  - RISEN: the first moment either wrist has been clearly higher than where it started for a couple of frames.
 *    A hand lifted to the face or head counts as a clear lift even though it is not a "raised hand" pose.
 * Pure.
 */
export interface OnsetState {
  ref: { L?: XY; R?: XY } | null;
  run: number;
  candidate: number | null;
  /** Time the movement started, once confirmed. */
  onset: number | null;
  riseRun: number;
  riseCandidate: number | null;
  /** Time the hand was first clearly lifted (confirmed). */
  risenAt: number | null;
  /** Diagnostic: the highest the hand got above its start, in shoulder widths. */
  maxRise: number;
}

export const createOnset = (): OnsetState => ({
  ref: null, run: 0, candidate: null, onset: null, riseRun: 0, riseCandidate: null, risenAt: null, maxRise: 0,
});

export function stepOnset(s: OnsetState, t: number, tracks: { L?: XY; R?: XY }, sw: number | null): OnsetState {
  const c = CV_CONFIG.onset;
  if (!sw) return s;
  if (!s.ref) return { ...s, ref: { L: tracks.L, R: tracks.R } };
  if (s.risenAt !== null) return s; // a clear lift is final

  // an old movement that never turned into a lift (a scratch, a fidget) is dropped: measure again from here
  if (s.onset !== null && t - s.onset > c.maxToGestureMs) return { ...createOnset(), ref: { L: tracks.L, R: tracks.R }, maxRise: s.maxRise };

  const ref = { ...s.ref };
  let disp = 0;
  let rise = 0;
  for (const k of ['L', 'R'] as const) {
    const now = tracks[k];
    if (!now) continue;
    const start = ref[k];
    if (!start) { ref[k] = now; continue; }
    disp = Math.max(disp, dist(now, start) / sw);
    rise = Math.max(rise, (start[1] - now[1]) / sw); // y grows downward, so a positive value means "higher than at the cue"
  }

  const next: OnsetState = { ...s, ref, maxRise: Math.max(s.maxRise, rise) };

  if (disp >= c.displacementSw) {
    next.run = s.run + 1;
    next.candidate = s.run === 0 ? t : s.candidate;
    next.onset = s.onset ?? (next.run >= c.frames ? next.candidate : null);
  } else if (s.onset === null) {
    next.run = 0;
    next.candidate = null;
  }

  if (rise >= c.riseSw) {
    next.riseRun = s.riseRun + 1;
    next.riseCandidate = s.riseRun === 0 ? t : s.riseCandidate;
    if (next.riseRun >= c.riseFrames) next.risenAt = next.riseCandidate;
  } else {
    next.riseRun = 0;
    next.riseCandidate = null;
  }
  return next;
}
