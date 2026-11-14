import type { ReplayDataset, ReplayFrame } from './types';

export interface Advance { frames: ReplayFrame[]; posMs: number; wrapped: boolean; ended: boolean }

/**
 * Frames whose time lies in (fromMs, fromMs + deltaMs]. With loop the position wraps at the end of the recording;
 * without it the player stops at the end. Pure: the engine decides what to do with the frames.
 */
export function advance(ds: ReplayDataset, fromMs: number, deltaMs: number, loop: boolean): Advance {
  const end = ds.durationMs;
  const out: ReplayFrame[] = [];
  let pos = fromMs, left = deltaMs, wrapped = false;
  let guard = 0;
  while (left > 0 && guard++ < 4) {
    const stop = Math.min(end, pos + left);
    for (const f of ds.frames) if (f.t > pos && f.t <= stop) out.push(f);
    left -= stop - pos;
    pos = stop;
    if (pos >= end) {
      if (!loop) return { frames: out, posMs: end, wrapped, ended: true };
      pos = -1; wrapped = true; // so that the frame at t = 0 plays again
    }
  }
  return { frames: out, posMs: Math.max(0, pos), wrapped, ended: false };
}

/** First frame after `fromMs` that carries a blood-pressure value (used when the astronaut taps Measure during replay). */
export function nextBpFrame(ds: ReplayDataset, fromMs: number): ReplayFrame | null {
  return ds.frames.find((f) => f.t > fromMs && f.sys !== undefined) ?? ds.frames.find((f) => f.sys !== undefined) ?? null;
}
