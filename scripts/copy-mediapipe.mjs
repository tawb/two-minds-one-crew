// Copies the MediaPipe WASM runtime from node_modules into public/mediapipe/wasm
// so the reaction test works offline. Never fails the install.
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dest = 'public/mediapipe/wasm';
try {
  if (!existsSync(src)) {
    console.log('[copy-mediapipe] source not found, skipping');
  } else {
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
    console.log('[copy-mediapipe] copied WASM runtime to', dest);
  }
} catch (e) {
  console.log('[copy-mediapipe] skipped:', e.message);
}
