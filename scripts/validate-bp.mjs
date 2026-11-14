// Runs the app's blood-pressure estimator (src/validation) on the public Pulse Transit Time PPG headers in data/ptt
// (download them first with `npm run fetch-data`), prints the errors and saves src/validation/last-result.json.
//
//   npm run validate:bp
//
// The TypeScript modules are loaded through Vite's own loader, so no extra packages are needed and the code that is
// validated is exactly the code in src/validation.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data', 'ptt');

if (!existsSync(DIR) || !readdirSync(DIR).some((f) => f.endsWith('.hea'))) {
  console.error('No Pulse Transit Time headers found in data/ptt. Run `npm run fetch-data` first.');
  process.exit(1);
}

const server = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { parsePttHeader } = await server.ssrLoadModule('/src/validation/ptt.ts');
  const { validateOnPtt, formatResult } = await server.ssrLoadModule('/src/validation/run.ts');
  const records = readdirSync(DIR).filter((f) => f.endsWith('.hea')).map((f) => parsePttHeader(readFileSync(join(DIR, f), 'utf8'))).filter(Boolean);
  const result = validateOnPtt(records);
  console.log(formatResult(result));
  writeFileSync(join(ROOT, 'src', 'validation', 'last-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('\nSaved src/validation/last-result.json (shown on the Validation page).');
} finally {
  await server.close();
}
