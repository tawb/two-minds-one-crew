// Response check: an on-device, camera-based alertness check against the astronaut's OWN baseline.
// Not a diagnosis. See the "Response check (camera)" section of the README.
//
// Screens that only need the result (for example the body figure) should import from './cvStatus' directly,
// so the camera and MediaPipe code stay out of their bundle. This index is what the lazy route loads.

export { default } from './ResponseCheckPage';
export { default as ResponseCheckPage } from './ResponseCheckPage';
export { useCvStatus, cvFlag } from './cvStatus';
export { CV_RESULT_EVENT, dispatchCvResult } from './events';
export type { CvResultDetail } from './events';
export type { ResponseState } from './types';
export { CV_CONFIG } from './config';
