// Synthetic landmarks and a scripted "person" for tests. No camera, no MediaPipe.
import { COMMANDS } from './commands';
import type { CommandId, Frame, HandDetection, Pt } from '../types';
import type { RunnerView, SessionRunner } from './runner';

export const ASPECT = 4 / 3;

export type WristPose = 'down' | 'mid' | 'raised' | 'straight' | 'nose' | 'head';

export interface PoseSpec {
  right?: WristPose; // the person's RIGHT hand (anatomical: appears on the image LEFT in a raw frame)
  left?: WristPose;
  scale?: number; // 1 = normal distance
  hideRight?: boolean;
  hideLeft?: boolean;
  visibility?: number;
}

// Positions for the RIGHT side (x < 0.5); the left side mirrors x about 0.5.
const WRIST: Record<WristPose, [number, number]> = {
  down: [0.38, 0.8], mid: [0.36, 0.52], raised: [0.34, 0.2], nose: [0.47, 0.3], head: [0.47, 0.1],
  // arm straight up above the shoulder: the wrist is ~0.5 shoulder widths from the nose (must stay "raised", not "head")
  straight: [0.4, 0.05],
};

export function makePose(spec: PoseSpec = {}): Pt[] {
  const s = spec.scale ?? 1;
  const vis = spec.visibility ?? 1;
  const at = (x: number, y: number, visibility = vis): Pt => ({ x: 0.5 + (x - 0.5) * s, y: 0.5 + (y - 0.5) * s, visibility });
  const pts: Pt[] = Array.from({ length: 33 }, () => at(0.5, 0.9));
  pts[0] = at(0.5, 0.25);
  pts[12] = at(0.4, 0.45); // right shoulder
  pts[11] = at(0.6, 0.45); // left shoulder
  const place = (side: 'right' | 'left', pose: WristPose, hidden?: boolean) => {
    const [x, y] = WRIST[pose];
    const px = side === 'right' ? x : 1 - x;
    const w = at(px, y, hidden ? 0.05 : vis);
    const tip = at(px, y - 0.02, hidden ? 0.05 : vis);
    if (side === 'right') { pts[16] = w; pts[20] = tip; } else { pts[15] = w; pts[19] = tip; }
  };
  place('right', spec.right ?? 'down', spec.hideRight);
  place('left', spec.left ?? 'down', spec.hideLeft);
  return pts;
}

export interface Fingers { index: boolean; middle: boolean; ring: boolean; pinky: boolean }

export function makeHand(fingers: Fingers, at: [number, number], opts: { score?: number; handedness?: 'Left' | 'Right' | null; size?: number } = {}): HandDetection {
  const size = opts.size ?? 0.08;
  const lm: Pt[] = Array.from({ length: 21 }, () => ({ x: at[0], y: at[1] }));
  const cols = [
    { name: 'index', mcp: 5, pip: 6, dip: 7, tip: 8 },
    { name: 'middle', mcp: 9, pip: 10, dip: 11, tip: 12 },
    { name: 'ring', mcp: 13, pip: 14, dip: 15, tip: 16 },
    { name: 'pinky', mcp: 17, pip: 18, dip: 19, tip: 20 },
  ] as const;
  cols.forEach((c, i) => {
    const dx = (i - 1.5) * 0.012;
    lm[c.mcp] = { x: at[0] + dx, y: at[1] - size };
    lm[c.pip] = { x: at[0] + dx, y: at[1] - size * 1.3 };
    // straight finger: the joints continue upward; folded finger: the tip curls back down toward the palm
    lm[c.dip] = { x: at[0] + dx, y: at[1] - size * (fingers[c.name] ? 1.7 : 1.1) };
    lm[c.tip] = { x: at[0] + dx, y: at[1] - size * (fingers[c.name] ? 2.0 : 0.9) };
  });
  return { landmarks: lm, handedness: opts.handedness ?? null, score: opts.score ?? 0.95 };
}

export const FINGERS = {
  one: { index: true, middle: false, ring: false, pinky: false },
  two: { index: true, middle: true, ring: false, pinky: false },
  fist: { index: false, middle: false, ring: false, pinky: false },
  open: { index: true, middle: true, ring: true, pinky: true },
};

export function makeFrame(t: number, pose: PoseSpec | null, hands: HandDetection[] = [], extra: Partial<Frame> = {}): Frame {
  return { t, pose: pose ? makePose(pose) : null, hands, aspect: ASPECT, luma: 140, ...extra };
}

/** What the camera sees when the person performs a command (hand commands: a hand at the right wrist). */
export function frameForCommand(t: number, id: CommandId): Frame {
  switch (id) {
    case 'raiseRight': return makeFrame(t, { right: 'raised' });
    case 'raiseLeft': return makeFrame(t, { left: 'raised' });
    case 'raiseBoth': return makeFrame(t, { right: 'raised', left: 'raised' });
    case 'touchNose': return makeFrame(t, { right: 'nose' });
    case 'handOnHead': return makeFrame(t, { right: 'head' });
    case 'oneFinger': return makeFrame(t, { right: 'mid' }, [makeHand(FINGERS.one, WRIST.mid)]);
    case 'twoFingers': return makeFrame(t, { right: 'mid' }, [makeHand(FINGERS.two, WRIST.mid)]);
    case 'fist': return makeFrame(t, { right: 'mid' }, [makeHand(FINGERS.fist, WRIST.mid)]);
    case 'openHand': return makeFrame(t, { right: 'mid' }, [makeHand(FINGERS.open, WRIST.mid)]);
  }
}

export const idForText = (text: string): CommandId | undefined => COMMANDS.find((c) => c.text === text)?.id;

export interface DriveCtx {
  t: number;
  view: RunnerView | null;
  /** ms since the current cue appeared (null when no cue is showing). */
  sinceCue: number | null;
  /** 1-based count of cues so far (reaction cues first). */
  cueNumber: number;
  /** The command being asked for, during the command phase. */
  commandId: CommandId | undefined;
}

/** Runs a session at `fps`, asking `person` for the frame content at each step. Returns every view and the end time. */
export function drive(runner: SessionRunner, person: (c: DriveCtx) => Frame, opts: { fps?: number; maxMs?: number } = {}): { views: RunnerView[]; endT: number } {
  const dt = 1000 / (opts.fps ?? 30);
  const maxMs = opts.maxMs ?? 240_000;
  const views: RunnerView[] = [];
  let view: RunnerView | null = null;
  let cueStart: number | null = null;
  let cueNumber = 0;
  let t = 1000;
  for (; t < 1000 + maxMs && !(runner.finished || runner.stopped); t += dt) {
    const ctx: DriveCtx = {
      t, view, sinceCue: cueStart === null ? null : t - cueStart, cueNumber,
      commandId: view && view.phase === 'commands' && view.cue ? idForText(view.instruction) : undefined,
    };
    const frame = person(ctx);
    const prevCue = view?.cue ?? false;
    view = runner.step({ ...frame, t });
    views.push(view);
    if (view.cue && !prevCue) { cueStart = t; cueNumber++; runner.markCueShown(t); }
    if (!view.cue) cueStart = null;
  }
  return { views, endT: t };
}
