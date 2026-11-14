/**
 * A "run" of consecutive frames in which something is true, tolerant of one-frame flicker (landmark detectors drop
 * a frame now and then). Pure.
 */
export interface Run {
  /** Frames in which the condition was true. */
  count: number;
  /** Time of the first true frame. */
  since: number | null;
  /** Dropout frames in a row right now. */
  gap: number;
}

export const emptyRun = (): Run => ({ count: 0, since: null, gap: 0 });

export function stepRun(r: Run, active: boolean, t: number, maxGap: number): Run {
  if (active) return { count: r.count + 1, since: r.since ?? t, gap: 0 };
  if (r.count > 0 && r.gap < maxGap) return { ...r, gap: r.gap + 1 }; // forgive a single dropped frame
  return emptyRun();
}

/** True once the condition has held for at least `frames` true frames and `ms` milliseconds. */
export const held = (r: Run, t: number, frames: number, ms: number) => r.count >= frames && r.since !== null && t - r.since >= ms;
