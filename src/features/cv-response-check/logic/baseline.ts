import { CV_CONFIG } from '../config';
import type { StoredSession } from '../types';
import { mad, median } from './stats';

export interface BaselineScore {
  /** Fewer than `minSessions` sessions on record: the personal baseline is not used yet. */
  calibrating: boolean;
  sessionsSoFar: number;
  sessionsNeeded: number;
  baselineMedianMs: number | null;
  /** Robust deviation: (current - own median) / (1.4826 x MAD). Positive = slower than usual. null while calibrating. */
  deviation: number | null;
  /** Percent slower (+) or faster (-) than the astronaut's own median. null while calibrating. */
  percentChange: number | null;
}

/**
 * Compare a session's median reaction time with the astronaut's OWN history (last sessions, median and MAD).
 * `history` must NOT include the session being scored.
 */
export function scoreAgainstBaseline(currentMs: number | null, history: StoredSession[]): BaselineScore {
  const b = CV_CONFIG.baseline;
  const values = history
    .map((s) => s.medianReactionMs)
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .slice(-b.maxSessions);
  const base: BaselineScore = {
    calibrating: values.length < b.minSessions, sessionsSoFar: values.length, sessionsNeeded: b.minSessions,
    baselineMedianMs: null, deviation: null, percentChange: null,
  };
  if (values.length === 0) return base;
  const med = median(values) as number;
  base.baselineMedianMs = Math.round(med);
  if (base.calibrating || currentMs === null) return base;
  const spread = Math.max((mad(values) as number) * b.madScale, med * b.minRelMad);
  base.deviation = Math.round(((currentMs - med) / spread) * 100) / 100;
  base.percentChange = Math.round(((currentMs / med) - 1) * 100);
  return base;
}
