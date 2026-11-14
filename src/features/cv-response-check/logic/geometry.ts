import { CV_CONFIG } from '../config';
import type { Pt, XY } from '../types';
import { clamp } from './stats';

/** MediaPipe pose landmark indices (anatomical: LEFT = the person's left, whatever the screen shows). */
export const POSE = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_WRIST: 15, R_WRIST: 16,
  L_INDEX: 19, R_INDEX: 20,
} as const;

/** Put a landmark in frame-height units so x and y distances are comparable. */
export const xy = (p: Pt, aspect: number): XY => [p.x * aspect, p.y];

export const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Angle at point b (degrees) between b->a and b->c, in 3D. MediaPipe's z uses roughly the same scale as x. */
export function angleDeg(a: Pt, b: Pt, c: Pt, aspect: number): number {
  const v = (p: Pt): [number, number, number] => [(p.x - b.x) * aspect, p.y - b.y, ((p.z ?? 0) - (b.z ?? 0)) * aspect];
  const u = v(a), w = v(c);
  const nu = Math.hypot(...u), nw = Math.hypot(...w);
  if (nu < 1e-9 || nw < 1e-9) return 180;
  const cos = Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (nu * nw)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Landmark is seen (visibility) and inside the frame. */
export function seen(p: Pt | undefined, minVis: number = CV_CONFIG.pose.minVisibility, margin: number = CV_CONFIG.pose.frameMargin): p is Pt {
  if (!p) return false;
  if ((p.visibility ?? 1) < minVis) return false;
  return p.x >= margin && p.x <= 1 - margin && p.y >= margin && p.y <= 1 - margin;
}

/** Shoulder width in frame-height units, or null if either shoulder is not seen. */
export function shoulderWidth(pose: Pt[], aspect: number): number | null {
  const l = pose[POSE.L_SHOULDER], r = pose[POSE.R_SHOULDER];
  if (!seen(l) || !seen(r)) return null;
  const w = dist(xy(l, aspect), xy(r, aspect));
  return w > 1e-6 ? w : null;
}

export interface Sample { t: number; sw: number; pts: { L?: XY; R?: XY; H?: XY } }

export interface MovementMetrics { peakSpeed: number | null; smoothness: number | null }

/** Peak speed (SW/s) and smoothness of the moving hand. Uses the tracked point with the longest path. */
export function movementMetrics(samples: Sample[]): MovementMetrics {
  const { jitterFloor, maxPlausibleSpeed, minStraight } = CV_CONFIG.movement;
  let best: { path: number; straight: number; peak: number } | null = null;
  for (const key of ['L', 'R', 'H'] as const) {
    const s = samples.filter((x) => x.pts[key]);
    if (s.length < 3) continue;
    let path = 0;
    const speeds: number[] = [];
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i];
      const sw = (a.sw + b.sw) / 2;
      const step = dist(a.pts[key]!, b.pts[key]!) / sw;
      const dt = (b.t - a.t) / 1000;
      if (step < jitterFloor) continue;
      path += step;
      if (dt > 0.005) {
        const v = step / dt;
        if (v <= maxPlausibleSpeed) speeds.push(v);
      }
    }
    const swAvg = s.reduce((n, x) => n + x.sw, 0) / s.length;
    const straight = dist(s[0].pts[key]!, s[s.length - 1].pts[key]!) / swAvg;
    // 3-point moving average so one noisy frame cannot set the peak
    let peak = 0;
    for (let i = 0; i < speeds.length; i++) {
      const w = speeds.slice(Math.max(0, i - 1), i + 2);
      peak = Math.max(peak, w.reduce((n, v) => n + v, 0) / w.length);
    }
    if (!best || path > best.path) best = { path, straight, peak };
  }
  if (!best || best.path <= 0) return { peakSpeed: null, smoothness: null };
  return {
    peakSpeed: best.peak > 0 ? best.peak : null,
    smoothness: best.straight >= minStraight ? clamp(best.path / best.straight, 1, 99) : null,
  };
}
