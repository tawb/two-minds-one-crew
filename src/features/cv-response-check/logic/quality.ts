import { CV_CONFIG } from '../config';
import type { Frame } from '../types';
import { POSE, seen, shoulderWidth } from './geometry';

export interface QualityIssue { code: 'no-person' | 'head' | 'shoulders' | 'hands' | 'too-far' | 'too-close' | 'dark' | 'bright'; message: string }

export interface QualityResult { ok: boolean; issues: QualityIssue[] }

/**
 * Checks one frame before the session may start. Returns every problem with a plain fix message.
 * Needs: head, both shoulders, both hands (wrists) in view, a sensible distance and adequate lighting.
 */
export function evaluateQuality(frame: Frame): QualityResult {
  const q = CV_CONFIG.quality;
  const issues: QualityIssue[] = [];
  const pose = frame.pose;
  if (!pose || pose.length < 21) {
    return { ok: false, issues: [{ code: 'no-person', message: 'I cannot see you. Step in front of the camera so your head and shoulders are in view.' }] };
  }
  if (!seen(pose[POSE.NOSE])) issues.push({ code: 'head', message: 'Your head is not fully in view. Move back a little or tilt the camera up.' });
  const sw = shoulderWidth(pose, frame.aspect);
  if (sw === null) issues.push({ code: 'shoulders', message: 'Both shoulders must be in view. Centre yourself in the picture.' });
  if (!seen(pose[POSE.L_WRIST]) || !seen(pose[POSE.R_WRIST])) {
    issues.push({ code: 'hands', message: 'Both hands must be in view. Rest them where the camera can see them, below your shoulders.' });
  }
  if (sw !== null) {
    const frac = sw / frame.aspect; // shoulder width as a fraction of frame width
    if (frac < q.shoulderFracMin) issues.push({ code: 'too-far', message: 'You are too far away. Move closer to the camera.' });
    else if (frac > q.shoulderFracMax) issues.push({ code: 'too-close', message: 'You are too close. Move back from the camera.' });
  }
  if (frame.luma !== undefined) {
    if (frame.luma < q.lumaMin) issues.push({ code: 'dark', message: 'The room is too dark. Turn on a light in front of you.' });
    else if (frame.luma > q.lumaMax) issues.push({ code: 'bright', message: 'The picture is too bright. Avoid a strong light behind or beside you.' });
  }
  return { ok: issues.length === 0, issues };
}
