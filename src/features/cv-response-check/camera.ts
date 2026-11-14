// Thin camera layer. Frames are only ever held in memory for detection: nothing is recorded or uploaded.

export type CameraErrorCode = 'denied' | 'no-camera' | 'in-use' | 'unsupported' | 'unknown';

export class CameraError extends Error {
  constructor(public readonly code: CameraErrorCode, message: string) { super(message); }
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('unsupported', 'This browser cannot use the camera here. Open the app on localhost or over HTTPS in a current browser.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
  } catch (e) {
    const name = (e as DOMException).name;
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraError('denied', 'Camera permission was blocked. Allow the camera for this site in the browser settings, then try again.');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CameraError('no-camera', 'No camera was found. Connect a camera and try again.');
    if (name === 'NotReadableError' || name === 'AbortError') throw new CameraError('in-use', 'The camera is in use by another app. Close it and try again.');
    throw new CameraError('unknown', `The camera could not start (${name || 'unknown error'}).`);
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function stopCamera(video: HTMLVideoElement | null, stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}

/** Returns a function that measures the mean brightness (0-255) of the current video frame on a tiny canvas. */
export function createLumaMeter(): (video: HTMLVideoElement) => number | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 24;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return (video) => {
    if (!ctx || video.readyState < 2) return undefined;
    try {
      ctx.drawImage(video, 0, 0, 32, 24);
      const d = ctx.getImageData(0, 0, 32, 24).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return sum / (d.length / 4);
    } catch {
      return undefined;
    }
  };
}
