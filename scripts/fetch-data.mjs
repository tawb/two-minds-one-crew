// One-time download of SMALL subsets of open public datasets into data/ (not committed), then conversion to the
// replay format in public/replay/ (also not committed). This is the only part of the project that uses the network,
// and only when you run it:   npm run fetch-data
//
// Options:  --skip=ptt,cgmacros,aging    skip datasets
//           --cgm=1,2                    CGMacros participants (default 1,2)
//           --aging=12                   Autonomic Aging records per age band and sex (default 12)
//           --days=3                     days of CGMacros data to convert (default 3)
//           --subjects=1-22              Pulse Transit Time subjects to convert (default all that downloaded)
//
// ACCESS TERMS CHECKED (14 Nov 2026) - all three are open access on PhysioNet, no credentials needed:
//   Pulse Transit Time PPG   v1.1.0  ODbL 1.0           https://physionet.org/content/pulse-transit-time-ppg/1.1.0/
//   CGMacros                 v1.0.0  CC BY-NC-SA 4.0    https://physionet.org/content/cgmacros/1.0.0/   (NON-COMMERCIAL, share-alike)
//   Autonomic Aging          v1.0.0  ODbL 1.0           https://physionet.org/content/autonomic-aging-cardiovascular/1.0.0/
// NOT downloaded:
//   PulseDB - multi-gigabyte ICU-derived waveform set; not a small subset. Check its terms before use.
//   Apple Watch sleep set - not downloaded in this version; the sleep view uses replay data or the simulator instead.

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'public', 'replay');
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? 'true']; }));
const skip = new Set((args.skip ?? '').split(',').filter(Boolean));
const UA = { 'User-Agent': 'astrovitals-fetch-data/1 (open-data download script)' };

const PTT = 'https://physionet.org/files/pulse-transit-time-ppg/1.1.0';
const CGM = 'https://physionet.org/files/cgmacros/1.0.0/CGMacros_dateshifted365.zip';
const AGING = 'https://physionet.org/files/autonomic-aging-cardiovascular/1.0.0';

const log = (...a) => console.log(...a);
mkdirSync(DATA, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function get(url, headers = {}) {
  const r = await fetch(url, { headers: { ...UA, ...headers }, redirect: 'follow' });
  if (!r.ok && r.status !== 206) throw new Error(`${r.status} ${url}`);
  return r;
}
const text = async (url) => (await get(url)).text();
const bytes = async (url, range) => new Uint8Array(await (await get(url, range ? { Range: `bytes=${range[0]}-${range[1]}` } : {})).arrayBuffer());
const saveText = (p, t) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t); };

// ───────────────────────── Pulse Transit Time PPG ─────────────────────────
async function fetchPtt() {
  log('\n[ptt] Pulse Transit Time PPG (ODbL 1.0): downloading the 66 small .hea headers (no waveforms)');
  const records = (await text(`${PTT}/RECORDS`)).split(/\s+/).filter(Boolean);
  const dir = join(DATA, 'ptt');
  mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const rec of records) {
    const p = join(dir, `${rec}.hea`);
    if (!existsSync(p)) { saveText(p, await text(`${PTT}/${rec}.hea`)); n++; }
  }
  log(`[ptt] ${records.length} headers in data/ptt (${n} new)`);
}

function parsePttHeader(txt) {
  const first = txt.split('\n')[0].trim().split(/\s+/); // "s1_sit 18 500 254026"
  const fs = Number(first[2]), samples = Number(first[3]);
  const meta = {};
  for (const m of txt.matchAll(/<(\w+)>:\s*([^<]+)/g)) meta[m[1]] = m[2].trim();
  const num = (k) => (meta[k] !== undefined && meta[k] !== '' ? Number(meta[k]) : undefined);
  return {
    rec: meta.filename, activity: meta.activity, sex: meta.gender, age: num('age'), durationMs: Math.round((samples / fs) * 1000),
    sys: [num('bp_sys_start'), num('bp_sys_end')], dia: [num('bp_dia_start'), num('bp_dia_end')],
    hr: [[num('hr_1_start'), num('hr_2_start')], [num('hr_1_end'), num('hr_2_end')]],
  };
}
const mean = (a) => { const v = a.filter((x) => typeof x === 'number' && !Number.isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : undefined; };

function convertPtt() {
  const dir = join(DATA, 'ptt');
  if (!existsSync(dir)) return null;
  const heads = readdirSync(dir).filter((f) => f.endsWith('.hea')).map((f) => parsePttHeader(readFileSync(join(dir, f), 'utf8'))).filter((h) => h.rec);
  const sNum = (r) => Number(r.match(/^s(\d+)_/)?.[1] ?? 0);
  const order = { sit: 0, walk: 1, run: 2 };
  heads.sort((a, b) => sNum(a.rec) - sNum(b.rec) || (order[a.activity] ?? 9) - (order[b.activity] ?? 9));
  const frames = [];
  let t = 0;
  for (const h of heads) {
    const moving = h.activity !== 'sit';
    const seg = `${h.rec.split('_')[0]} ${h.activity} (${h.sex}, ${h.age})`;
    // Only the values that were actually measured at the start and end of each recording are used. Nothing is interpolated.
    const point = (ms, i) => ({
      t: ms, hr: Math.round(mean(h.hr[i]) ?? NaN), sys: h.sys[i], dia: h.dia[i], activity: moving ? 'active' : 'resting',
      quality: moving ? 'motion' : 'good', posture: moving ? 'standing' : 'seated', exerciseMinAgo: moving ? 0 : null, mealMinAgo: null, sleepHours: null, seg,
    });
    for (const [ms, i] of [[t + 1000, 0], [t + h.durationMs, 1]]) {
      const f = point(ms, i);
      if (Number.isNaN(f.hr)) delete f.hr;
      if (f.sys === undefined || f.dia === undefined) { delete f.sys; delete f.dia; }
      frames.push(f);
    }
    t += h.durationMs + 5000;
  }
  return {
    id: 'ptt', title: 'Pulse Transit Time PPG: sit, walk, run (public recording)', kind: 'public',
    description: `${heads.length} short recordings from healthy adults sitting, walking and running. One frame at the start and one at the end of each recording, using the measured BP and HR values only.`,
    attribution: 'Mehrgardt P, Khushi M, Poon S, Withana A. Pulse Transit Time PPG Dataset (v1.1.0), PhysioNet. https://physionet.org/content/pulse-transit-time-ppg/1.1.0/',
    license: 'ODbL 1.0', limits: 'Healthy volunteers, one session each. Blood pressure is a start and an end value per recording, not a continuous trace. Not astronaut data.',
    durationMs: t, frames,
  };
}

// ───────────────────────── CGMacros (ranged read from one big zip) ─────────────────────────
async function zipDirectory(size) {
  const T = 600000;
  const tail = await bytes(CGM, [size - T, size - 1]);
  const dv = new DataView(tail.buffer);
  let i = tail.length - 22;
  while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
  if (i < 0) throw new Error('zip end record not found');
  const n = dv.getUint16(i + 10, true), cdSize = dv.getUint32(i + 12, true), cdOff = dv.getUint32(i + 16, true);
  const base = size - T;
  if (cdOff < base) throw new Error('central directory is larger than the tail read');
  const cd = new DataView(tail.buffer, cdOff - base, cdSize);
  const dec = new TextDecoder();
  const out = new Map();
  let p = 0;
  for (let k = 0; k < n && p + 46 <= cd.byteLength; k++) {
    const method = cd.getUint16(p + 10, true), csize = cd.getUint32(p + 20, true), usize = cd.getUint32(p + 24, true);
    const nl = cd.getUint16(p + 28, true), el = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), off = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl));
    out.set(name, { method, csize, usize, off });
    p += 46 + nl + el + cl;
  }
  return out;
}
async function zipEntry(e) {
  const head = await bytes(CGM, [e.off, e.off + 29]);
  const dv = new DataView(head.buffer);
  const start = e.off + 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
  const raw = await bytes(CGM, [start, start + e.csize - 1]);
  return new TextDecoder().decode(e.method === 8 ? inflateRawSync(raw) : raw);
}

async function fetchCgm() {
  log('\n[cgmacros] CGMacros (CC BY-NC-SA 4.0, NON-COMMERCIAL): reading only the chosen participant files from the zip with range requests');
  const head = await get(CGM, { Range: 'bytes=0-0' });
  const size = Number((head.headers.get('content-range') ?? '').split('/')[1]);
  if (!size) throw new Error('could not read the zip size');
  const dir = await zipDirectory(size);
  const ids = (args.cgm ?? '1,2').split(',').map((s) => s.trim().padStart(3, '0'));
  const folder = join(DATA, 'cgmacros');
  const bio = dir.get('CGMacros/bio.csv');
  if (bio && !existsSync(join(folder, 'bio.csv'))) saveText(join(folder, 'bio.csv'), await zipEntry(bio));
  for (const id of ids) {
    const name = `CGMacros/CGMacros-${id}/CGMacros-${id}.csv`;
    const e = dir.get(name);
    if (!e) { log(`[cgmacros] participant ${id} not found in the zip, skipped`); continue; }
    const p = join(folder, `CGMacros-${id}.csv`);
    if (!existsSync(p)) { saveText(p, await zipEntry(e)); log(`[cgmacros] saved participant ${id} (${(e.usize / 1024).toFixed(0)} KB)`); }
  }
  log('[cgmacros] note: meal photos in the zip were NOT downloaded.');
}

function csvRows(txt) {
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',').map((s) => s.trim());
  return lines.slice(1).map((l) => { const c = l.split(','); return Object.fromEntries(head.map((h, i) => [h, c[i]])); });
}
const ACTIVE_METS_X10 = 30; // TODO(flight-surgeon) 3.0 METs (the Fitbit METs column is x10). Only used to label replayed frames "active"; not a clinical limit.

function convertCgm(id, days) {
  const p = join(DATA, 'cgmacros', `CGMacros-${id}.csv`);
  if (!existsSync(p)) return null;
  const rows = csvRows(readFileSync(p, 'utf8'));
  const t0 = Date.parse(`${rows[0].Timestamp.replace(' ', 'T')}Z`);
  const firstMidnight = Math.ceil(t0 / 86400000) * 86400000;
  const end = firstMidnight + days * 86400000;
  let bio = '';
  const bp = join(DATA, 'cgmacros', 'bio.csv');
  if (existsSync(bp)) {
    const b = csvRows(readFileSync(bp, 'utf8')).find((r) => Number(r.subject) === Number(id));
    if (b) bio = ` Participant ${Number(id)}: age ${b.Age}, ${b.Gender === 'F' ? 'female' : 'male'}, lab HbA1c ${b['A1c PDL (Lab)']} %.`;
  }
  const frames = [];
  let lastActive = null, lastMeal = null, bucket = -1, pendingMeal = 0;
  for (const r of rows) {
    const ts = Date.parse(`${r.Timestamp.replace(' ', 'T')}Z`);
    if (ts < firstMidnight || ts >= end) continue;
    const mets = Number(r.METs);
    if (!Number.isNaN(mets) && mets >= ACTIVE_METS_X10) lastActive = ts;
    const carbs = Number(r.Carbs);
    if (r['Meal Type'] && !Number.isNaN(carbs)) { lastMeal = ts; pendingMeal += carbs; }
    const b = Math.floor((ts - firstMidnight) / 300000);
    if (b === bucket) continue;
    bucket = b;
    const glu = Number(r['Libre GL'] || r['Dexcom GL']);
    const hr = Number(r.HR);
    const active = !Number.isNaN(mets) && mets >= ACTIVE_METS_X10;
    const f = {
      t: ts - firstMidnight, activity: active ? 'active' : 'resting', quality: active ? 'motion' : 'good', posture: 'unknown',
      exerciseMinAgo: lastActive === null ? null : Math.round((ts - lastActive) / 60000), mealMinAgo: lastMeal === null ? null : Math.round((ts - lastMeal) / 60000), sleepHours: null,
    };
    if (!Number.isNaN(glu) && glu > 0) f.glucose = Math.round(glu);
    if (!Number.isNaN(hr) && hr > 0) f.hr = Math.round(hr);
    if (pendingMeal > 0) { f.mealCarbsG = Math.round(pendingMeal); pendingMeal = 0; }
    frames.push(f);
  }
  return {
    id: `cgmacros-${id}`, title: `CGMacros participant ${Number(id)}: glucose, heart rate, meals (public recording)`, kind: 'public',
    description: `${days} days of 5-minute samples from one adult wearing a continuous glucose monitor and a Fitbit, with logged meals.${bio}`,
    attribution: 'Das S, et al. CGMacros: A pilot scientific dataset for personalized nutrition and diet monitoring (v1.0.0), PhysioNet. https://physionet.org/content/cgmacros/1.0.0/',
    license: 'CC BY-NC-SA 4.0', nonCommercial: true,
    limits: 'Public glucose data of this kind mostly comes from people with diabetes or at risk of it; CGMacros includes participants with different glucose status. Not astronaut data. Posture is not recorded.',
    durationMs: days * 86400000, frames,
  };
}

// ───────────────────────── Autonomic Aging: resting HR and HRV bands from ECG ─────────────────────────
// Age groups in subject-info.csv: 1 = 18-19, 2 = 20-24, 3 = 25-29, 4 = 30-34, 5 = 35-39, 6 = 40-44, 7 = 45-49, 8 = 50-54 ... 15 = 85-92. Sex: 0 male, 1 female.
const AGING_WINDOW_S = 120; // first two minutes of each record
const AGING_BANDS = [{ lo: 18, hi: 34, groups: [1, 2, 3, 4] }, { lo: 35, hi: 49, groups: [5, 6, 7] }, { lo: 50, hi: 92, groups: [8, 9, 10, 11, 12, 13, 14, 15] }];

async function fetchAging() {
  const perBand = Number(args.aging ?? 12);
  log(`\n[aging] Autonomic Aging (ODbL 1.0): subject-info.csv plus the first ${AGING_WINDOW_S} s of up to ${perBand} records per age band and sex (ECG only)`);
  const dir = join(DATA, 'autonomic-aging');
  const sp = join(dir, 'subject-info.csv');
  if (!existsSync(sp)) saveText(sp, await text(`${AGING}/subject-info.csv`));
  const subs = csvRows(readFileSync(sp, 'utf8'));
  const chosen = [];
  for (const b of AGING_BANDS) {
    for (const sex of ['0', '1']) {
      const pool = subs.filter((r) => b.groups.includes(Number(r.Age_group)) && r.Sex === sex && r.Device === '0');
      const step = Math.max(1, Math.floor(pool.length / perBand));
      let k = 0;
      for (let i = 0; i < pool.length && k < perBand; i += step, k++) chosen.push({ id: pool[i].ID });
    }
  }
  let got = 0;
  for (const c of chosen) {
    const base = join(dir, c.id);
    if (existsSync(`${base}.ecg.bin`)) continue;
    try {
      const hea = await text(`${AGING}/${c.id}.hea`);
      saveText(`${base}.hea`, hea);
      const raw = await bytes(`${AGING}/${c.id}.dat`, [0, AGING_WINDOW_S * 1000 * 3 * 2 - 1]);
      writeFileSync(`${base}.ecg.bin`, raw);
      got++;
    } catch (e) { log(`[aging] ${c.id} skipped: ${e.message}`); }
  }
  log(`[aging] ${got} new record windows in data/autonomic-aging (${chosen.length} chosen)`);
}

// R-peak detection: squared derivative, moving-window integration, adaptive threshold, 250 ms refractory period.
function rPeaks(sig, fs) {
  const n = sig.length;
  const d = new Float64Array(n);
  for (let i = 2; i < n - 2; i++) d[i] = (-sig[i - 2] - 2 * sig[i - 1] + 2 * sig[i + 1] + sig[i + 2]) ** 2;
  const w = Math.round(0.08 * fs);
  const m = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += d[i]; if (i >= w) acc -= d[i - w]; m[i] = acc / w; }
  const sorted = Float64Array.from(m).sort();
  const thr = sorted[Math.floor(n * 0.995)] * 0.35;
  const peaks = [];
  let i = 0;
  while (i < n) {
    if (m[i] > thr) {
      let j = i, best = i;
      while (j < n && m[j] > thr) { if (m[j] > m[best]) best = j; j++; }
      let r = best, bv = -Infinity; // refine to the steepest point of the signal near the integrator peak
      for (let k = Math.max(3, best - Math.round(0.1 * fs)); k < Math.min(n, best + Math.round(0.04 * fs)); k++) {
        const s3 = Math.abs(sig[k] - sig[k - 3]);
        if (s3 > bv) { bv = s3; r = k; }
      }
      if (!peaks.length || r - peaks[peaks.length - 1] > 0.25 * fs) peaks.push(r);
      i = j;
    } else i++;
  }
  return peaks;
}
function hrAndRmssd(peaks, fs) {
  const rr = [];
  for (let i = 1; i < peaks.length; i++) rr.push(((peaks[i] - peaks[i - 1]) / fs) * 1000);
  const med = rr.slice().sort((a, b) => a - b)[Math.floor(rr.length / 2)];
  const ok = rr.map((x) => x > 300 && x < 2000 && Math.abs(x - med) < 0.3 * med);
  const good = rr.filter((_, i) => ok[i]);
  if (good.length < 40) return null; // not enough clean beats in the window
  const hr = 60000 / (good.reduce((s, x) => s + x, 0) / good.length);
  const diffs = [];
  for (let i = 1; i < rr.length; i++) if (ok[i] && ok[i - 1]) diffs.push(rr[i] - rr[i - 1]);
  if (diffs.length < 30) return null;
  return { hr, rmssd: Math.sqrt(diffs.reduce((s, x) => s + x * x, 0) / diffs.length), beats: good.length };
}
const pct = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); const k = (a.length - 1) * p; const f = Math.floor(k); return a[f] + (a[Math.min(a.length - 1, f + 1)] - a[f]) * (k - f); };

function convertAging() {
  const dir = join(DATA, 'autonomic-aging');
  const sp = join(dir, 'subject-info.csv');
  if (!existsSync(sp)) return null;
  const subs = csvRows(readFileSync(sp, 'utf8'));
  const per = new Map();
  let used = 0, dropped = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ecg.bin'))) {
    const id = f.slice(0, 4);
    const sub = subs.find((r) => r.ID === id);
    if (!sub) continue;
    const buf = readFileSync(join(dir, f));
    const v = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + (buf.length - (buf.length % 2))));
    const hea = readFileSync(join(dir, `${id}.hea`), 'utf8').split('\n');
    const best = [0, 1].map((ch) => {
      const gain = Number(hea[1 + ch].trim().split(/\s+/)[2].split('(')[0]);
      const sig = new Float64Array(Math.floor(v.length / 3));
      for (let i = 0; i < sig.length; i++) sig[i] = v[i * 3 + ch] / gain;
      return hrAndRmssd(rPeaks(sig, 1000), 1000);
    }).filter(Boolean).sort((a, b) => b.beats - a.beats)[0];
    if (!best || best.hr < 35 || best.hr > 130) { dropped++; continue; }
    const band = AGING_BANDS.find((b) => b.groups.includes(Number(sub.Age_group)));
    const sex = sub.Sex === '0' ? 'male' : 'female';
    const key = `${band.lo}-${band.hi}|${sex}`;
    if (!per.has(key)) per.set(key, { ageMin: band.lo, ageMax: band.hi, sex, hr: [], rmssd: [] });
    per.get(key).hr.push(best.hr);
    per.get(key).rmssd.push(best.rmssd);
    used++;
  }
  const bands = [...per.values()].map((b) => ({
    ageMin: b.ageMin, ageMax: b.ageMax, sex: b.sex, n: b.hr.length,
    hr: { p5: pct(b.hr, 0.05), median: pct(b.hr, 0.5), p95: pct(b.hr, 0.95) },
    rmssd: { p5: pct(b.rmssd, 0.05), median: pct(b.rmssd, 0.5), p95: pct(b.rmssd, 0.95) },
  }));
  return {
    source: 'Autonomic Aging cardiovascular dataset (v1.0.0), PhysioNet, ODbL 1.0: Schumann A, Bar KJ. https://physionet.org/content/autonomic-aging-cardiovascular/1.0.0/',
    method: `First ${AGING_WINDOW_S} s of the ECG of each sampled record; R peaks found with a simple derivative detector; heart rate = 60000 / mean clean RR; RMSSD of successive clean RR differences. Bands are the 5th, 50th and 95th percentile of the sampled people. Records with fewer than 40 clean beats or an implausible rate were dropped.`,
    limits: 'A small sample (not the whole dataset), healthy volunteers, short windows, recorded at rest. Percentiles of a sample, not clinical limits and not astronaut data. Blood pressure from the waveform channel was not used.',
    used, dropped, bands,
  };
}

async function main() {
  const ran = [];
  const attempt = async (name, fn) => {
    if (skip.has(name)) { log(`[${name}] skipped by --skip`); return; }
    try { await fn(); ran.push(name); } catch (e) { log(`[${name}] download failed: ${e.message}. Existing files in data/ are still used.`); }
  };
  await attempt('ptt', fetchPtt);
  await attempt('cgmacros', fetchCgm);
  await attempt('aging', fetchAging);

  const files = [];
  const ptt = convertPtt();
  if (ptt) { saveText(join(OUT, 'ptt.json'), JSON.stringify(ptt)); files.push('ptt.json'); log(`\n[convert] public/replay/ptt.json: ${ptt.frames.length} frames`); }
  const aging = convertAging();
  if (aging) {
    saveText(join(OUT, 'aging-reference.json'), JSON.stringify(aging, null, 1));
    log(`[convert] public/replay/aging-reference.json: ${aging.bands.length} bands from ${aging.used} records (${aging.dropped} dropped)`);
    for (const x of aging.bands) log(`   ${x.sex} ${x.ageMin}-${x.ageMax}: n=${x.n}  HR ${x.hr.p5.toFixed(0)}-${x.hr.p95.toFixed(0)} (median ${x.hr.median.toFixed(0)})  RMSSD ${x.rmssd.p5.toFixed(0)}-${x.rmssd.p95.toFixed(0)} (median ${x.rmssd.median.toFixed(0)})`);
  }
  const cgmDir = join(DATA, 'cgmacros');
  if (existsSync(cgmDir)) {
    for (const f of readdirSync(cgmDir).filter((x) => /^CGMacros-\d+\.csv$/.test(x))) {
      const id = f.match(/(\d+)/)[1];
      const ds = convertCgm(id, Number(args.days ?? 3));
      if (ds) { saveText(join(OUT, `cgmacros-${id}.json`), JSON.stringify(ds)); files.push(`cgmacros-${id}.json`); log(`[convert] public/replay/cgmacros-${id}.json: ${ds.frames.length} frames`); }
    }
  }
  saveText(join(OUT, 'manifest.json'), JSON.stringify({ files, generatedBy: 'npm run fetch-data' }));
  saveText(join(DATA, 'README.txt'), [
    'Open data downloaded by `npm run fetch-data`. This folder is not committed to git. Respect each license:', '',
    'Pulse Transit Time PPG (ODbL 1.0)      https://physionet.org/content/pulse-transit-time-ppg/1.1.0/',
    'CGMacros (CC BY-NC-SA 4.0, NON-COMMERCIAL, share-alike, attribution required)   https://physionet.org/content/cgmacros/1.0.0/',
    'Autonomic Aging cardiovascular (ODbL 1.0)   https://physionet.org/content/autonomic-aging-cardiovascular/1.0.0/', '',
    'Not downloaded: PulseDB (multi-gigabyte; check its terms), Apple Watch sleep set.', '',
  ].join('\n'));
  log(`\nDone. Datasets available for replay: ${files.length ? files.join(', ') : 'none (the synthetic day is always available)'}.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
