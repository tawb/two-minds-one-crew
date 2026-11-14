// Sets up everything the Response check needs to run fully offline:
//   1. copies the MediaPipe WASM runtime from node_modules to public/mediapipe/wasm
//   2. downloads the two model files ONCE to public/models (skipped if already there)
// After this, the app makes no network request for the camera feature. Usage: npm run setup:cv [-- --force]
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const force = process.argv.includes('--force');

const WASM_SRC = 'node_modules/@mediapipe/tasks-vision/wasm';
const WASM_DEST = 'public/mediapipe/wasm';

const MODELS = [
  {
    file: 'public/models/pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    minBytes: 1_000_000,
  },
  {
    file: 'public/models/hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    minBytes: 1_000_000,
  },
];

let failed = false;

if (!existsSync(WASM_SRC)) {
  console.error('[setup-cv] ERROR: ' + WASM_SRC + ' not found. Run "npm install" first.');
  failed = true;
} else {
  mkdirSync(WASM_DEST, { recursive: true });
  cpSync(WASM_SRC, WASM_DEST, { recursive: true });
  console.log('[setup-cv] WASM runtime copied to ' + WASM_DEST);
}

for (const m of MODELS) {
  const have = existsSync(m.file) && statSync(m.file).size >= m.minBytes;
  if (have && !force) {
    console.log('[setup-cv] already present: ' + m.file + ' (' + (statSync(m.file).size / 1e6).toFixed(1) + ' MB)');
    continue;
  }
  try {
    console.log('[setup-cv] downloading ' + m.url);
    const res = await fetch(m.url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < m.minBytes) throw new Error('file too small (' + buf.length + ' bytes), download looks wrong');
    mkdirSync(dirname(m.file), { recursive: true });
    writeFileSync(m.file, buf);
    console.log('[setup-cv] saved ' + m.file + ' (' + (buf.length / 1e6).toFixed(1) + ' MB)');
  } catch (e) {
    failed = true;
    console.error('[setup-cv] ERROR downloading ' + m.file + ': ' + e.message);
    console.error('           Download it manually from: ' + m.url);
  }
}

if (failed) {
  console.error('[setup-cv] finished WITH ERRORS. The Response check will tell you which file is missing.');
  process.exit(1);
}
console.log('[setup-cv] done. The Response check now works offline.');
