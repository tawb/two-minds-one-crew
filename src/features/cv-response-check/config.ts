// Every threshold of the Response check lives here.
//
// Two kinds of TODO tags mark numbers that are NOT validated:
//   TODO(flight-surgeon)       clinical / interpretive numbers: needs expert review before any real use.
//   TODO(tune-with-real-camera) geometry numbers: tuned by hand on synthetic landmarks only; check with real people.
//
// Geometry is measured in "shoulder widths" (SW): the distance between the two shoulder landmarks,
// so results do not depend on how far the person is from the camera.

export const CV_CONFIG = {
  // ───────── timing ─────────
  /** Consecutive frames a gesture must hold before it counts. At ~30 fps, 3 frames is ~100 ms. */
  stableFrames: 3, // TODO(tune-with-real-camera)
  /** ... and for at least this long, so a gesture that only flickers past does not count. */
  stableMs: 150, // TODO(tune-with-real-camera)
  /** A gesture may drop out for this many frames in a row without restarting the hold (detectors flicker). */
  stableGapFrames: 1, // TODO(tune-with-real-camera)
  /** Consecutive "hands down" frames needed before a cue may appear. */
  neutralFrames: 4, // TODO(tune-with-real-camera)
  /** Countdown before the first trial, in ms. */
  countdownMs: 3000,

  // ───────── pose geometry (units: shoulder widths) ─────────
  pose: {
    /** Landmark visibility below this is treated as "not seen". */
    minVisibility: 0.5, // TODO(tune-with-real-camera)
    /** A wrist counts as raised when it is this far above the shoulder line. */
    raiseMargin: 0.25, // TODO(tune-with-real-camera)
    /** A wrist counts as down when it is this far below the shoulder line. */
    downMargin: 0.3, // TODO(tune-with-real-camera)
    /** Wrist (or index tip) within this distance of the nose = touching the nose. */
    noseRadius: 0.45, // TODO(tune-with-real-camera)
    /** Hand on head: wrist above the nose by at least this much ... */
    headMinAbove: 0.5, // TODO(tune-with-real-camera)
    /** ... and at most this much ... */
    headMaxAbove: 1.4, // TODO(tune-with-real-camera)
    /** ... and no further than this sideways from the nose. */
    headMaxDx: 0.35, // TODO(tune-with-real-camera): tight on purpose, an arm raised straight up is ~0.5 SW from the nose and must stay "raised"
    /** Margin (fraction of frame) a landmark must stay inside to count as "in view". */
    frameMargin: 0.02,
  },

  // ───────── hand geometry ─────────
  hand: {
    /** Minimum hand-detection score. */
    minScore: 0.6, // TODO(tune-with-real-camera)
    /** Fingertip-to-wrist distance / palm size at or above this = finger extended. */
    /** Fingers are judged mainly by the bend angle at the middle joint (in 3D): straight = extended, bent = folded. */
    straightAngleDeg: 150, // TODO(tune-with-real-camera)
    bentAngleDeg: 115, // TODO(tune-with-real-camera)
    /** Fallback when the angle is in between: fingertip-to-wrist distance / palm size. */
    extendedRatio: 1.6, // TODO(tune-with-real-camera)
    /** ... at or below this = finger folded. Between the two = unknown (gesture not recognised). */
    foldedRatio: 1.25, // TODO(tune-with-real-camera)
    /** A detected hand is matched to the pose wrist if it is within this many SW. */
    matchRadius: 1.0,
  },

  // ───────── movement metrics ─────────
  movement: {
    /** Per-frame steps smaller than this (in SW) are treated as tracking jitter. */
    jitterFloor: 0.004, // TODO(tune-with-real-camera)
    /** Speeds above this (SW/s) are treated as tracking glitches and ignored. */
    maxPlausibleSpeed: 25, // TODO(tune-with-real-camera)
    /** Smoothness needs at least this straight-line travel (SW). */
    minStraight: 0.5,
  },

  // ───────── movement onset ─────────
  // Reaction time is when the hand STARTS to move (not when it finally reaches the target zone), so how long the
  // arm takes to travel does not inflate it. The gesture time is still recorded separately.
  onset: {
    /** A wrist must move this far (shoulder widths) from where it was at the cue ... */
    displacementSw: 0.12, // TODO(tune-with-real-camera)
    /** ... for this many consecutive frames. */
    frames: 2,
    /** A hand is "clearly lifted" when a wrist is this far (shoulder widths) higher than at the cue ... */
    riseSw: 0.5, // TODO(tune-with-real-camera)
    /** ... for this many consecutive frames. In the reaction round a clear lift is a response; it does not have to be held. */
    riseFrames: 2,
    /** If the target gesture is not reached within this long after movement starts, that movement is dropped (a scratch, a fidget). */
    maxToGestureMs: 1500, // TODO(tune-with-real-camera)
  },

  // ───────── command trials ─────────
  commands: {
    perSessionMin: 6,
    perSessionMax: 8,
    /** No correct gesture within this time after the cue = missed (timeout). */
    timeoutMs: 8000, // TODO(flight-surgeon): how long without a response counts as a miss
    /** Hands-down never reached within this time = trial discarded. */
    neutralTimeoutMs: 6000,
    /** A different command's gesture held this many frames counts as one wrong attempt. */
    wrongFrames: 3, // TODO(tune-with-real-camera)
    /** ... AND held for at least this long. Hands pass through other gestures on the way to the right one; a real wrong attempt dwells. */
    wrongDwellMs: 350, // TODO(tune-with-real-camera)
    /** Discard a trial if the pose was lost for more than this fraction of its frames. */
    poseLostDiscardFraction: 0.4,
    /** Discard a MISSED hand command if the hand was not detected for more than this fraction of frames. */
    handMissingDiscardFraction: 0.5,
  },

  // ───────── reaction round (PVT-style) ─────────
  reaction: {
    trials: 5,
    waitMinMs: 2000,
    waitMaxMs: 5000,
    /** A response is a lapse if slower than max(lapseFloorMs, lapseMultiplier x the person's own typical time).
     *  The 500 ms PVT limit is for button presses and does not fit an arm raised in front of a camera. */
    lapseFloorMs: 800, // TODO(flight-surgeon)
    lapseMultiplier: 1.5, // TODO(flight-surgeon)
    /** No response within this time after the cue = lapse (no response). */
    noResponseMs: 3000, // TODO(flight-surgeon)
    /** Raising a hand sooner than this after the cue = anticipation (false start). */
    anticipationMs: 100, // TODO(flight-surgeon)
    /** After this many false starts in one trial the trial is dropped. */
    maxFalseStartsPerTrial: 3,
    /** Discard a no-response trial if the pose was lost for more than this fraction of its cue window. */
    poseLostDiscardFraction: 0.4,
  },

  // ───────── quality gates (before starting) ─────────
  quality: {
    /** Mean brightness (0-255) must be inside this range. */
    lumaMin: 55, // TODO(tune-with-real-camera)
    lumaMax: 225, // TODO(tune-with-real-camera)
    /** Shoulder width as a fraction of the frame WIDTH must be inside this range. */
    shoulderFracMin: 0.14, // TODO(tune-with-real-camera)
    shoulderFracMax: 0.6, // TODO(tune-with-real-camera)
    /** Consecutive good frames before "ready". */
    readyFrames: 15,
  },

  // ───────── personal baseline ─────────
  baseline: {
    /** Sessions kept per astronaut. */
    maxSessions: 30,
    /** Sessions needed before the personal baseline is used. */
    minSessions: 3, // TODO(flight-surgeon)
    /** Scales MAD so it is comparable to a standard deviation for normally distributed data. */
    madScale: 1.4826,
    /** MAD floor as a fraction of the median, so a very steady history does not give huge scores. */
    minRelMad: 0.05, // TODO(flight-surgeon)
  },

  /** Used ONLY while calibrating (fewer than baseline.minSessions sessions). */
  placeholderBands: {
    reactionNormalMaxMs: 1500, // TODO(flight-surgeon): placeholder, not a clinical value
    reactionWatchMaxMs: 2200, // TODO(flight-surgeon): placeholder, not a clinical value
  },

  // ───────── status decision ─────────
  status: {
    /** Robust deviation (slower than own median, in MAD-scaled units) for "watch" / "check-in suggested". */
    watchZ: 2.0, // TODO(flight-surgeon)
    checkInZ: 3.5, // TODO(flight-surgeon)
    /** Share of commands with a wrong or missed response. */
    watchErrorRate: 0.25, // TODO(flight-surgeon)
    checkInErrorRate: 0.5, // TODO(flight-surgeon)
    /** Share of reaction trials that were lapses. */
    watchLapseRate: 0.4, // TODO(flight-surgeon)
    checkInLapseRate: 0.6, // TODO(flight-surgeon)
    /** While still calibrating (no personal baseline yet) the status never goes above this level: 1 = watch.
     *  The placeholder bands are not a reason to suggest a check-in. */
    calibratingMaxLevel: 1, // TODO(flight-surgeon)
    /** Fewer valid trials than this = "inconclusive". */
    minValidTrials: 5, // TODO(flight-surgeon)
  },

  storage: { keyPrefix: 'cv-response-check:v1' },

  assets: {
    wasmDir: 'mediapipe/wasm',
    poseModel: 'models/pose_landmarker_lite.task',
    handModel: 'models/hand_landmarker.task',
  },
} as const;

export type CvConfig = typeof CV_CONFIG;
