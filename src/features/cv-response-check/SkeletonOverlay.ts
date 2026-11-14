import type { Frame } from './types';

// Pose connections worth drawing: shoulders, arms, nose line. Landmark indices follow MediaPipe Pose.
const LINES: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [0, 11], [0, 12]];

/** Small live skeleton on a canvas that sits exactly over the (CSS-mirrored) video. Nothing is stored. */
export function drawSkeleton(canvas: HTMLCanvasElement, frame: Frame | null, accent = '#FBF1E6') {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return;
  const w = canvas.width, h = canvas.height;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  if (frame.pose) {
    const p = frame.pose;
    for (const [a, b] of LINES) {
      if ((p[a]?.visibility ?? 1) < 0.5 || (p[b]?.visibility ?? 1) < 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(p[a].x * w, p[a].y * h);
      ctx.lineTo(p[b].x * w, p[b].y * h);
      ctx.stroke();
    }
    for (const i of [0, 11, 12, 15, 16]) {
      if ((p[i]?.visibility ?? 1) < 0.5) continue;
      ctx.beginPath();
      ctx.arc(p[i].x * w, p[i].y * h, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#B98BC4';
  for (const hand of frame.hands) {
    for (const pt of hand.landmarks) {
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
