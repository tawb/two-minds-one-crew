import type { ResponseState } from './types';

/**
 * Integration contract. After every finished session the feature dispatches
 *   window.dispatchEvent(new CustomEvent('cv-result', { detail }))
 * Anything on the page can listen for it. A session that is stopped early dispatches nothing.
 */
export interface CvResultDetail {
  check: 'response';
  /** "inconclusive" means too few valid trials to decide. */
  state: ResponseState;
  /** Median reaction-round time in ms, or null if none could be measured. */
  medianReactionMs: number | null;
  /** Robust score against the astronaut's own baseline (positive = slower). null while calibrating. */
  baselineDeviation: number | null;
  /** Trials answered correctly and not discarded. */
  completed: number;
  /** Trials planned (reaction trials + commands). */
  total: number;
  /** Wrong-gesture attempts + missed commands. */
  errors: number;
  /** Reaction trials that were too slow or had no response. */
  lapses: number;
  falseStarts: number;
  /** Date.now() when the session finished. */
  timestamp: number;
}

export const CV_RESULT_EVENT = 'cv-result';

declare global {
  interface WindowEventMap {
    'cv-result': CustomEvent<CvResultDetail>;
  }
}

export function dispatchCvResult(detail: CvResultDetail): void {
  window.dispatchEvent(new CustomEvent<CvResultDetail>(CV_RESULT_EVENT, { detail }));
}
