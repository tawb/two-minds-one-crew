// Shared types for the Response check. Plain data only: no DOM, no camera.

/** A landmark in MediaPipe's normalised image coordinates (x right, y down, both 0..1). */
export interface Pt { x: number; y: number; z?: number; visibility?: number }

export interface HandDetection {
  landmarks: Pt[]; // 21 points
  /** MediaPipe's label. NOTE: it assumes a mirrored (selfie) input. We feed raw frames, so we do not trust it
   *  unless no pose wrist is available to match the hand to. */
  handedness: 'Left' | 'Right' | null;
  score: number;
}

/** One camera frame after landmark detection. `t` is performance.now() (ms). */
export interface Frame {
  t: number;
  pose: Pt[] | null; // 33 points, or null if no person
  hands: HandDetection[];
  /** video width / height, so x and y can be put in the same units. */
  aspect: number;
  /** Mean brightness 0-255 of the frame, if measured. */
  luma?: number;
  /** True if the frame was flipped horizontally BEFORE detection. Default false (raw frame). */
  mirrored?: boolean;
}

export type PoseCommandId = 'raiseRight' | 'raiseLeft' | 'raiseBoth' | 'touchNose' | 'handOnHead';
export type HandCommandId = 'oneFinger' | 'twoFingers' | 'fist' | 'openHand';
export type CommandId = PoseCommandId | HandCommandId;

export interface CommandDef {
  id: CommandId;
  kind: 'pose' | 'hand';
  /** Big on-screen text. */
  text: string;
}

export type GestureMap = Record<CommandId, boolean>;

export type XY = [number, number];

/** What a single frame says about the person. */
export interface Detection {
  poseOk: boolean;
  /** Shoulder width in frame-height units (x already multiplied by aspect). */
  sw: number | null;
  gestures: GestureMap;
  /** Either hand raised (right, left or both). */
  anyRaised: boolean;
  /** Both wrists are below the shoulder line (or not in view). */
  handsDown: boolean;
  handsSeen: number;
  /** Aspect-corrected positions used for speed / smoothness. */
  tracks: { L?: XY; R?: XY; H?: XY };
}

export type TrialOutcome = 'correct' | 'timeout' | 'no-neutral' | 'skipped';

export interface CommandResult {
  id: CommandId;
  kind: 'pose' | 'hand';
  outcome: TrialOutcome;
  correct: boolean;
  /** Cue shown -> the hand started to move. This is the reaction time. */
  reactionMs: number | null;
  /** Cue shown -> first frame of the held correct gesture (includes the time the arm takes to get there). */
  gestureMs: number | null;
  /** Cue shown -> the frame at which the gesture had been held for `stableFrames`. */
  confirmMs: number | null;
  wrongAttempts: number;
  /** Peak hand speed in shoulder widths per second. */
  peakSpeedSwPerS: number | null;
  /** Path length / straight distance (1 = perfectly straight). */
  smoothness: number | null;
  frames: number;
  poseLostFraction: number;
  handMissingFraction: number;
  discarded: boolean;
  discardReason: string | null;
  /** What the camera saw, to help tune: how high the hand got and which gestures were detected (frames each). */
  diag: { peakRiseSw: number; seen: Partial<Record<CommandId, number>> };
}

export interface PvtTrialResult {
  index: number;
  /** Cue shown -> the hand started to move. null if there was no response. */
  reactionMs: number | null;
  /** Cue shown -> hand clearly raised. */
  gestureMs: number | null;
  /** True only for "no response" here. Slow responses are marked as lapses when the session is summarised. */
  lapse: boolean;
  falseStarts: number;
  discarded: boolean;
  discardReason: string | null;
  skipped: boolean;
  /** What the camera saw: how high the hand got (shoulder widths above its start) and for how many frames a raised-hand pose was seen. */
  diag: { peakRiseSw: number; raisedFrames: number; poseLostFraction: number };
}

export interface RawSession {
  startedAt: number;
  endedAt: number;
  reaction: PvtTrialResult[];
  commands: CommandResult[];
  /** Median camera frame interval: the timing resolution of every reaction time here. */
  frameIntervalMs: number | null;
}

export type ResponseState = 'normal' | 'watch' | 'check-in suggested' | 'inconclusive';

export interface SessionSummary {
  medianReactionMs: number | null; // reaction round: the primary alertness measure
  commandMedianMs: number | null;
  completed: number;
  total: number;
  errors: number; // wrong attempts + missed commands
  errorRate: number; // share of valid commands with a wrong or missed response
  lapses: number;
  lapseRate: number;
  /** Reaction trials slower than this (ms) were counted as lapses. */
  lapseThresholdMs: number;
  falseStarts: number;
  validReaction: number;
  /** Reaction trials in which a hand movement was registered. */
  reactionAnswered: number;
  validCommands: number;
  discarded: number;
  skipped: number;
  peakSpeedMedian: number | null;
  smoothnessMedian: number | null;
  frameIntervalMs: number | null;
}

export interface StoredSession {
  timestamp: number;
  medianReactionMs: number | null;
  commandMedianMs: number | null;
  errorRate: number;
  lapseRate: number;
  state: ResponseState;
}
