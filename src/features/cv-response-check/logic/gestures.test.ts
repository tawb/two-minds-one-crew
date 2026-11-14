import { describe, expect, it } from 'vitest';
import { ALL_COMMAND_IDS, anatomicalSide, assignHands, detect } from './gestures';
import { ASPECT, FINGERS, frameForCommand, makeFrame, makeHand, makePose } from './testkit';
import type { CommandId } from '../types';

const active = (f: ReturnType<typeof makeFrame>): CommandId[] => {
  const d = detect(f);
  return ALL_COMMAND_IDS.filter((id) => d.gestures[id]);
};

describe('pose and hand gestures', () => {
  it.each(ALL_COMMAND_IDS)('recognises "%s" and nothing else', (id) => {
    expect(active(frameForCommand(0, id))).toEqual([id]);
  });

  it('a person standing with hands down triggers nothing and counts as hands-down', () => {
    const d = detect(makeFrame(0, {}));
    expect(d.poseOk).toBe(true);
    expect(d.handsDown).toBe(true);
    expect(ALL_COMMAND_IDS.filter((id) => d.gestures[id])).toEqual([]);
  });

  it('right and left are the PERSON\'S right and left (anatomical landmarks on a raw frame)', () => {
    const r = detect(makeFrame(0, { right: 'raised' }));
    const l = detect(makeFrame(0, { left: 'raised' }));
    expect(r.gestures.raiseRight && !r.gestures.raiseLeft).toBe(true);
    expect(l.gestures.raiseLeft && !l.gestures.raiseRight).toBe(true);
  });

  it('a frame flipped BEFORE detection (mirrored) swaps the labels back', () => {
    // landmarks say "left wrist raised" but the frame was mirrored first, so it is really the person's right hand
    const d = detect(makeFrame(0, { left: 'raised' }, [], { mirrored: true }));
    expect(d.gestures.raiseRight).toBe(true);
    expect(d.gestures.raiseLeft).toBe(false);
    expect(anatomicalSide('L', true)).toBe('R');
    expect(anatomicalSide('L', false)).toBe('L');
  });

  it('does not depend on distance: the same gestures at 0.6x and 1.15x scale', () => {
    for (const scale of [0.6, 1.15]) {
      for (const id of ['raiseRight', 'raiseBoth', 'touchNose', 'handOnHead'] as const) {
        const f = frameForCommand(0, id);
        const scaled = { ...f, pose: makePose({ right: id === 'raiseBoth' || id === 'raiseRight' ? 'raised' : id === 'touchNose' ? 'nose' : 'head', left: id === 'raiseBoth' ? 'raised' : 'down', scale }) };
        expect(detect(scaled).gestures[id]).toBe(true);
      }
    }
  });

  it('a hidden wrist can never count as a raised hand (missing hand)', () => {
    const d = detect(makeFrame(0, { right: 'raised', hideRight: true }));
    expect(d.gestures.raiseRight).toBe(false);
    expect(d.anyRaised).toBe(false);
  });

  it('low-score hand detections are ignored', () => {
    const f = makeFrame(0, { right: 'mid' }, [makeHand(FINGERS.fist, [0.36, 0.52], { score: 0.3 })]);
    expect(detect(f).gestures.fist).toBe(false);
    expect(detect(f).handsSeen).toBe(0);
  });

  it('a half-bent finger in an otherwise good gesture does not spoil it, but the KEY finger must be clearly extended', () => {
    const size = 0.08;
    const hand = makeHand(FINGERS.one, [0.36, 0.52], { size });
    // middle finger bent about 140 degrees at the middle joint, tip at an in-between distance from the wrist
    const pip = hand.landmarks[10];
    hand.landmarks[11] = { x: pip.x + (0.1 * size) / ASPECT, y: pip.y - 0.12 * size };
    hand.landmarks[12] = { x: pip.x + (0.1 * size) / ASPECT, y: 0.52 - 1.45 * size };
    // index clearly extended, middle in between, ring and pinky folded: still "one finger"
    expect(active(makeFrame(0, { right: 'mid' }, [hand]))).toEqual(['oneFinger']);
    // the same half-bent finger as the ONLY candidate for "two fingers" is not clearly extended, so two fingers is not claimed
    expect(active(makeFrame(0, { right: 'mid' }, [hand]))).not.toContain('twoFingers');
  });

  it('a finger pointing AT the camera still reads as extended (the bend angle is measured in 3D)', () => {
    const size = 0.08;
    const hand = makeHand(FINGERS.fist, [0.36, 0.52], { size });
    const mcp = hand.landmarks[5];
    // index finger straight, but pointing into the screen: it barely changes in 2D
    const step = (k: number) => ({ x: mcp.x, y: mcp.y - 0.1 * k * size, z: -k * size / ASPECT });
    hand.landmarks[6] = step(0.35);
    hand.landmarks[7] = step(0.7);
    hand.landmarks[8] = step(1.0);
    expect(active(makeFrame(0, { right: 'mid' }, [hand]))).toEqual(['oneFinger']);
  });

  it('an arm raised straight up (about 0.5 shoulder widths from the nose) is "raised", not "hand on head"', () => {
    const d = detect(makeFrame(0, { right: 'straight' }));
    expect(d.gestures.raiseRight).toBe(true);
    expect(d.gestures.handOnHead).toBe(false);
  });

  it('assignHands matches hands to the nearest pose wrist and falls back to a SWAPPED handedness label', () => {
    const pose = makePose({ right: 'mid', left: 'mid' });
    const frame = makeFrame(0, { right: 'mid', left: 'mid' }, [makeHand(FINGERS.open, [0.36, 0.52], { handedness: 'Left' })]);
    const sw = 0.2 * ASPECT;
    const rw: [number, number] = [pose[16].x * ASPECT, pose[16].y];
    const lw: [number, number] = [pose[15].x * ASPECT, pose[15].y];
    const near = assignHands(frame, lw, rw, sw);
    expect(near.R).toBeDefined(); // nearest wrist wins even though MediaPipe called it "Left"
    expect(near.L).toBeUndefined();
    // no wrist to match: raw frame, label "Left" means the person's RIGHT hand
    const far = assignHands(frame, null, null, sw);
    expect(far.R).toBeDefined();
    const farMirrored = assignHands({ ...frame, mirrored: true }, null, null, sw);
    expect(farMirrored.L).toBeDefined();
  });

  it('no person in the frame gives an empty detection', () => {
    const d = detect(makeFrame(0, null));
    expect(d.poseOk).toBe(false);
    expect(d.anyRaised).toBe(false);
  });
});
