import { describe, expect, it } from 'vitest';
import { CV_CONFIG } from '../config';
import { createOnset, stepOnset } from './onset';

const SW = 0.27;
const run = (frames: [number, [number, number]][]) => {
  let s = createOnset();
  for (const [t, p] of frames) s = stepOnset(s, t, { R: p }, SW);
  return s;
};

describe('movement onset', () => {
  it('stays quiet for tracking jitter and finds the first frame of a sustained movement', () => {
    const jitter = run([0, 33, 66, 100, 133].map((t, i) => [t, [0.3 + (i % 2) * 0.003, 0.8]] as [number, [number, number]]));
    expect(jitter.onset).toBeNull();
    const move = run([
      [0, [0.3, 0.8]], [33, [0.3, 0.8]], [66, [0.3, 0.8]],
      [100, [0.3, 0.7]], [133, [0.3, 0.6]], [166, [0.3, 0.5]],
    ]);
    expect(move.onset).toBe(100); // first frame that moved clearly and kept moving
  });

  it('a one-frame glitch is not a movement', () => {
    const s = run([[0, [0.3, 0.8]], [33, [0.3, 0.8]], [66, [0.3, 0.3]], [100, [0.3, 0.8]], [133, [0.3, 0.8]]]);
    expect(s.onset).toBeNull();
  });

  it('a movement that never becomes the target gesture is dropped after a while (a fidget)', () => {
    let s = createOnset();
    // a sideways fidget: moves clearly but never lifts
    s = stepOnset(s, 0, { R: [0.3, 0.8] }, SW);
    s = stepOnset(s, 33, { R: [0.45, 0.8] }, SW);
    s = stepOnset(s, 66, { R: [0.5, 0.8] }, SW);
    expect(s.onset).toBe(33);
    expect(s.risenAt).toBeNull();
    s = stepOnset(s, 33 + CV_CONFIG.onset.maxToGestureMs + 100, { R: [0.3, 0.5] }, SW);
    expect(s.onset).toBeNull(); // forgotten: measure again from here
  });

  it('a clear lift (hand well above where it started) is detected even if it is only to face height', () => {
    const s = run([[0, [0.3, 0.8]], [33, [0.3, 0.8]], [66, [0.3, 0.55]], [100, [0.3, 0.4]], [133, [0.3, 0.4]]]);
    expect(s.onset).toBe(66);
    expect(s.risenAt).toBe(66);
    expect(s.maxRise).toBeGreaterThan(1.2);
  });

  it('needs the shoulder width to judge distance', () => {
    expect(stepOnset(createOnset(), 0, { R: [0.3, 0.8] }, null).ref).toBeNull();
  });
});
