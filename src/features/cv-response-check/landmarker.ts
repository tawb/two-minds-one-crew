// MediaPipe Tasks Vision, fully on-device. WASM and both models are loaded from local paths in public/ (no CDN).
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { CV_CONFIG } from './config';
import type { Frame, HandDetection, Pt } from './types';

const base = import.meta.env.BASE_URL;
export const assetUrl = (path: string) => `${base}${path}`;

export class AssetsMissingError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing offline files: ${missing.join(', ')}. Run "npm run setup:cv" once (needs internet), then reload.`);
  }
}

/** Thrown by detect() when the GPU delegate fails while running. The caller should call reloadOnCpu(). */
export class GpuFailed extends Error {
  constructor(public readonly original: unknown) { super('GPU delegate failed at runtime'); }
}

export interface Landmarkers {
  detect(video: HTMLVideoElement, t: number): Frame;
  close(): void;
  readonly delegate: 'GPU' | 'CPU';
}

/** A static server may answer a missing file with index.html, so check the type as well as the status. */
async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok && !(res.headers.get('content-type') ?? '').includes('html');
  } catch {
    return false;
  }
}

/** Returns the list of required offline files that are missing (empty = all present). */
export async function checkAssets(): Promise<string[]> {
  const a = CV_CONFIG.assets;
  const files = [`${a.wasmDir}/vision_wasm_internal.js`, `${a.wasmDir}/vision_wasm_internal.wasm`, a.poseModel, a.handModel];
  const found = await Promise.all(files.map((f) => exists(assetUrl(f))));
  return files.filter((_, i) => !found[i]);
}

type Models = { pose: PoseLandmarker; hand: HandLandmarker };

async function create(delegate: 'GPU' | 'CPU'): Promise<Models> {
  const a = CV_CONFIG.assets;
  const fileset = await FilesetResolver.forVisionTasks(assetUrl(a.wasmDir));
  const pose = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: assetUrl(a.poseModel), delegate },
    runningMode: 'VIDEO', numPoses: 1,
  });
  const hand = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: assetUrl(a.handModel), delegate },
    runningMode: 'VIDEO', numHands: 2,
  });
  return { pose, hand };
}

let shared: Promise<Landmarkers> | null = null;

function makeApi(models: Models, delegate: 'GPU' | 'CPU'): Landmarkers {
  let lastTs = 0;
  return {
    delegate,
    detect(video, t) {
      const ts = Math.max(lastTs + 1, Math.round(t)); // MediaPipe needs strictly increasing timestamps
      lastTs = ts;
      let poseRes: ReturnType<PoseLandmarker['detectForVideo']>;
      let handRes: ReturnType<HandLandmarker['detectForVideo']>;
      try {
        poseRes = models.pose.detectForVideo(video, ts);
        handRes = models.hand.detectForVideo(video, ts);
      } catch (e) {
        throw delegate === 'GPU' ? new GpuFailed(e) : e;
      }
      const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
      const hands: HandDetection[] = handRes.landmarks.map((lm, i) => {
        const cat = handRes.handedness[i]?.[0];
        const name = cat?.categoryName;
        return { landmarks: lm as Pt[], handedness: name === 'Left' || name === 'Right' ? name : null, score: cat?.score ?? 0 };
      });
      // We feed raw (unflipped) frames, so `mirrored` is false: pose labels are anatomical.
      return { t, aspect, mirrored: false, pose: poseRes.landmarks[0] ? (poseRes.landmarks[0] as Pt[]) : null, hands };
    },
    close() { models.pose.close(); models.hand.close(); shared = null; },
  };
}

/** Loads both landmarkers once. GPU delegate first, CPU if the GPU cannot be created. */
export function loadLandmarkers(): Promise<Landmarkers> {
  shared ??= (async () => {
    const missing = await checkAssets();
    if (missing.length) throw new AssetsMissingError(missing);
    try { return makeApi(await create('GPU'), 'GPU'); } catch { return makeApi(await create('CPU'), 'CPU'); }
  })().catch((e) => { shared = null; throw e; });
  return shared;
}

/** After GpuFailed: rebuild on the CPU. */
export async function reloadOnCpu(): Promise<Landmarkers> {
  shared = null;
  const api = makeApi(await create('CPU'), 'CPU');
  shared = Promise.resolve(api);
  return api;
}
