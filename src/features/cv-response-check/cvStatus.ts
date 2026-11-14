import { useEffect, useState } from 'react';
import { CV_RESULT_EVENT, type CvResultDetail } from './events';
import { loadLastResult } from './storage';

/** A Response check result older than this no longer marks the body figure. TODO(flight-surgeon): how long a result stays relevant. */
export const FRESH_MS = 24 * 3600_000;

/**
 * The latest Response check result for this astronaut: read from storage on load, refreshed whenever a
 * "cv-result" event fires. Light on purpose (no camera or MediaPipe code), so any screen can use it.
 */
export function useCvStatus(userId: string): CvResultDetail | null {
  const [last, setLast] = useState<CvResultDetail | null>(() => loadLastResult(userId));
  useEffect(() => {
    setLast(loadLastResult(userId));
    const on = () => setLast(loadLastResult(userId));
    window.addEventListener(CV_RESULT_EVENT, on);
    return () => window.removeEventListener(CV_RESULT_EVENT, on);
  }, [userId]);
  return last;
}

/** How a result should mark the head on the body figure. Normal and inconclusive results do not mark it. */
export function cvFlag(d: CvResultDetail | null, now = Date.now()): 'ok' | 'verify' | 'review' {
  if (!d || now - d.timestamp > FRESH_MS) return 'ok';
  if (d.state === 'check-in suggested') return 'review';
  if (d.state === 'watch') return 'verify';
  return 'ok';
}
