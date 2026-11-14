import { CV_CONFIG } from '../config';
import type { CommandId, Detection, Frame, GestureMap, HandDetection, Pt, XY } from '../types';
import { angleDeg, dist, POSE, seen, shoulderWidth, xy } from './geometry';

export const ALL_COMMAND_IDS: CommandId[] = [
  'raiseRight', 'raiseLeft', 'raiseBoth', 'touchNose', 'handOnHead',
  'oneFinger', 'twoFingers', 'fist', 'openHand',
];

const emptyGestures = (): GestureMap =>
  Object.fromEntries(ALL_COMMAND_IDS.map((id) => [id, false])) as GestureMap;

type WristKind = 'nose' | 'head' | 'raised' | 'down' | 'mid' | 'hidden';

/**
 * Which of the person's two sides a landmark belongs to.
 * Pose landmarks are anatomical (11/15 = the person's LEFT) for a raw, unflipped frame. If the frame was flipped
 * BEFORE detection (`mirrored`), the labels swap, so we swap them back.
 */
export function anatomicalSide(side: 'L' | 'R', mirrored = false): 'L' | 'R' {
  return mirrored ? (side === 'L' ? 'R' : 'L') : side;
}

/** Classify one wrist relative to the head and shoulders (everything in shoulder widths). */
function wristKind(
  wrist: Pt | undefined, indexTip: Pt | undefined, nose: XY, shoulderY: number, sw: number, aspect: number,
): { kind: WristKind; pos: XY | null } {
  const c = CV_CONFIG.pose;
  if (!seen(wrist)) return { kind: 'hidden', pos: null };
  const w = xy(wrist, aspect);
  const noseD = Math.min(dist(w, nose), seen(indexTip) ? dist(xy(indexTip, aspect), nose) : Infinity) / sw;
  if (noseD <= c.noseRadius) return { kind: 'nose', pos: w };
  const above = (nose[1] - w[1]) / sw; // how far above the nose (positive = higher)
  const dx = Math.abs(w[0] - nose[0]) / sw;
  if (above >= c.headMinAbove && above <= c.headMaxAbove && dx <= c.headMaxDx) return { kind: 'head', pos: w };
  const aboveShoulder = (shoulderY - w[1]) / sw;
  if (aboveShoulder >= c.raiseMargin) return { kind: 'raised', pos: w };
  if (aboveShoulder <= -c.downMargin) return { kind: 'down', pos: w };
  return { kind: 'mid', pos: w };
}

/** Which detected hand belongs to which side, matched to the nearest pose wrist (robust to handedness labels). */
export function assignHands(frame: Frame, lw: XY | null, rw: XY | null, sw: number): { L?: HandDetection; R?: HandDetection; extra: HandDetection[] } {
  const out: { L?: HandDetection; R?: HandDetection; extra: HandDetection[] } = { extra: [] };
  const hands = frame.hands.filter((h) => h.score >= CV_CONFIG.hand.minScore && h.landmarks.length >= 21);
  for (const h of [...hands].sort((a, b) => b.score - a.score)) {
    const wrist = xy(h.landmarks[0], frame.aspect);
    const dL = lw ? dist(wrist, lw) / sw : Infinity;
    const dR = rw ? dist(wrist, rw) / sw : Infinity;
    let side: 'L' | 'R' | null = null;
    if (Math.min(dL, dR) <= CV_CONFIG.hand.matchRadius) side = dL <= dR ? 'L' : 'R';
    else if (h.handedness) {
      // MediaPipe's label assumes a mirrored input: for a raw frame "Left" is the person's RIGHT hand.
      const label = h.handedness === 'Left' ? 'L' : 'R';
      side = frame.mirrored ? label : label === 'L' ? 'R' : 'L';
    }
    if (side && !out[side]) out[side] = h;
    else out.extra.push(h);
  }
  return out;
}

type FingerState = 'extended' | 'folded' | 'unknown';
const FINGERS = [
  { name: 'index', mcp: 5, pip: 6, dip: 7, tip: 8 },
  { name: 'middle', mcp: 9, pip: 10, dip: 11, tip: 12 },
  { name: 'ring', mcp: 13, pip: 14, dip: 15, tip: 16 },
  { name: 'pinky', mcp: 17, pip: 18, dip: 19, tip: 20 },
] as const;

/**
 * Extended / folded per finger. Mainly the bend angle at the middle joint in 3D (rotation and distance independent,
 * so a finger pointing at the camera still reads as straight); if the angle is in between, the fingertip-to-wrist
 * distance relative to palm size decides; if that is in between too, the finger is "unknown".
 */
export function fingerStates(hand: HandDetection, aspect: number): Record<'index' | 'middle' | 'ring' | 'pinky', FingerState> | null {
  const lm = hand.landmarks;
  const wrist = xy(lm[0], aspect);
  const palm = dist(wrist, xy(lm[9], aspect));
  if (palm < 1e-5) return null;
  const out = {} as Record<'index' | 'middle' | 'ring' | 'pinky', FingerState>;
  for (const f of FINGERS) {
    const angle = angleDeg(lm[f.mcp], lm[f.pip], lm[f.dip], aspect);
    if (angle >= CV_CONFIG.hand.straightAngleDeg) { out[f.name] = 'extended'; continue; }
    if (angle <= CV_CONFIG.hand.bentAngleDeg) { out[f.name] = 'folded'; continue; }
    const ratio = dist(wrist, xy(lm[f.tip], aspect)) / palm;
    out[f.name] = ratio >= CV_CONFIG.hand.extendedRatio ? 'extended' : ratio <= CV_CONFIG.hand.foldedRatio ? 'folded' : 'unknown';
  }
  return out;
}

function handGestureFlags(hand: HandDetection, aspect: number): Pick<GestureMap, 'oneFinger' | 'twoFingers' | 'fist' | 'openHand'> {
  const f = fingerStates(hand, aspect);
  const none = { oneFinger: false, twoFingers: false, fist: false, openHand: false };
  if (!f) return none;
  const { index, middle, ring, pinky } = f;
  // The fingers that DEFINE the gesture must be clearly extended. The others only need to be "not clearly extended":
  // a half-bent finger in an otherwise good gesture should not make the whole gesture unrecognisable.
  const ext = (s: FingerState) => s === 'extended';
  const fold = (s: FingerState) => s === 'folded';
  const all = [index, middle, ring, pinky];
  return {
    oneFinger: ext(index) && !ext(middle) && !ext(ring) && !ext(pinky),
    twoFingers: ext(index) && ext(middle) && !ext(ring) && !ext(pinky),
    fist: !all.some(ext) && all.filter(fold).length >= 3,
    openHand: ext(index) && ext(middle) && (ext(ring) || ext(pinky)) && !fold(ring) && !fold(pinky),
  };
}

/** Everything one frame says: which gestures are active, hands-down, and positions to track. */
export function detect(frame: Frame): Detection {
  const gestures = emptyGestures();
  const base: Detection = { poseOk: false, sw: null, gestures, anyRaised: false, handsDown: false, handsSeen: 0, tracks: {} };
  const pose = frame.pose;
  if (!pose || pose.length < 21) return { ...base, handsSeen: frame.hands.length };

  const sw = shoulderWidth(pose, frame.aspect);
  const nosePt = pose[POSE.NOSE];
  if (sw === null || !seen(nosePt)) return { ...base, handsSeen: frame.hands.length };

  const nose = xy(nosePt, frame.aspect);
  const shoulderY = (pose[POSE.L_SHOULDER].y + pose[POSE.R_SHOULDER].y) / 2;
  const L = wristKind(pose[POSE.L_WRIST], pose[POSE.L_INDEX], nose, shoulderY, sw, frame.aspect);
  const R = wristKind(pose[POSE.R_WRIST], pose[POSE.R_INDEX], nose, shoulderY, sw, frame.aspect);
  // Flip only if the frame was mirrored before detection (labels are then swapped).
  const [left, right] = frame.mirrored ? [R, L] : [L, R];

  const calm = (k: WristKind) => k === 'down' || k === 'mid' || k === 'hidden';
  gestures.raiseRight = right.kind === 'raised' && calm(left.kind);
  gestures.raiseLeft = left.kind === 'raised' && calm(right.kind);
  gestures.raiseBoth = left.kind === 'raised' && right.kind === 'raised';
  gestures.touchNose = left.kind === 'nose' || right.kind === 'nose';
  gestures.handOnHead = left.kind === 'head' || right.kind === 'head';

  const assigned = assignHands(frame, left.pos, right.pos, sw);
  const detected = [assigned.L, assigned.R, ...assigned.extra].filter((h): h is HandDetection => !!h);
  for (const h of detected) {
    const g = handGestureFlags(h, frame.aspect);
    gestures.oneFinger ||= g.oneFinger;
    gestures.twoFingers ||= g.twoFingers;
    gestures.fist ||= g.fist;
    gestures.openHand ||= g.openHand;
  }

  const tracks: Detection['tracks'] = {};
  if (left.pos) tracks.L = left.pos;
  if (right.pos) tracks.R = right.pos;
  if (detected[0]) tracks.H = xy(detected[0].landmarks[0], frame.aspect);

  return {
    poseOk: true,
    sw,
    gestures,
    anyRaised: gestures.raiseRight || gestures.raiseLeft || gestures.raiseBoth,
    handsDown: (left.kind === 'down' || left.kind === 'hidden') && (right.kind === 'down' || right.kind === 'hidden'),
    handsSeen: detected.length,
    tracks,
  };
}
