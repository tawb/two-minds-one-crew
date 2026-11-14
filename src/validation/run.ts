import { BP_ESTIMATOR, calibrate, estimateBp } from './estimator';
import type { PttRecord } from './ptt';
import { errorStats, type ErrorStats } from './stats';

export interface VariantResult { id: string; label: string; sys: ErrorStats; dia: ErrorStats }

export interface ValidationResult {
  /** "not-run" until `npm run validate:bp` has written a result. */
  status: 'not-run' | 'ok';
  ranAt: string | null;
  dataset: string;
  license: string;
  subjects: number;
  testPoints: number;
  method: string;
  estimator: { label: string; slopeSysPerBpm: number; slopeDiaPerBpm: number; placeholder: true };
  variants: VariantResult[];
  notes: string[];
}

export const VALIDATION_NOTES = [
  'The estimator is a PLACEHOLDER (calibration reading plus a heart-rate slope with made-up coefficients). The app does not contain a real cuffless blood-pressure estimator; displayed blood pressure always comes from the cuff.',
  'Data: healthy volunteers sitting, walking and running. Reference blood pressure is a cuff value at the start and at the end of each recording, not a continuous trace. Heart rate is the wrist PPG value from the dataset header.',
  'Calibration uses the first (seated) recording of the same person; walking and running are the test points. Calibration and test happen within one session, so this says nothing about how a calibration ages over days or weeks.',
  'PulseDB and other ICU-derived datasets, if added later, are for algorithm testing only. They are not a source of astronaut thresholds.',
  'Blood pressure in this dataset changes little between sitting and walking or running, so a calibration-only estimate that ignores heart rate already scores well. This test cannot show that the heart-rate term, or any estimator, tracks real changes.',
  'This is an algorithm check on public data. It is not a clinical validation and it does not show the device is accurate.',
];

export function notRun(): ValidationResult {
  return {
    status: 'not-run', ranAt: null, dataset: 'Pulse Transit Time PPG (PhysioNet)', license: 'ODbL 1.0', subjects: 0, testPoints: 0,
    method: 'Run `npm run fetch-data` and then `npm run validate:bp`.',
    estimator: { label: BP_ESTIMATOR.label, slopeSysPerBpm: BP_ESTIMATOR.slopeSysPerBpm, slopeDiaPerBpm: BP_ESTIMATOR.slopeDiaPerBpm, placeholder: true },
    variants: [], notes: VALIDATION_NOTES,
  };
}

const VARIANTS = [
  { id: 'calibration-only', label: 'Calibration reading only (no heart-rate term)', slopes: { sys: 0, dia: 0 } },
  { id: 'placeholder', label: BP_ESTIMATOR.label, slopes: { sys: BP_ESTIMATOR.slopeSysPerBpm, dia: BP_ESTIMATOR.slopeDiaPerBpm } },
];

/** Calibrate on each person's seated recording, estimate blood pressure at the start and end of their walking and running recordings. */
export function validateOnPtt(records: PttRecord[], now = new Date()): ValidationResult {
  const bySubject = new Map<number, PttRecord[]>();
  for (const r of records) bySubject.set(r.subject, [...(bySubject.get(r.subject) ?? []), r]);
  const errs = VARIANTS.map(() => ({ sys: [] as number[], dia: [] as number[] }));
  let subjects = 0, points = 0;
  for (const recs of bySubject.values()) {
    const sit = recs.find((r) => r.activity === 'sit');
    if (!sit || sit.sys[0] === null || sit.dia[0] === null || sit.hr[0] === null) continue;
    const cal = calibrate(sit.sys[0], sit.dia[0], sit.hr[0]);
    let used = false;
    for (const t of recs.filter((r) => r.activity !== 'sit')) {
      for (const i of [0, 1] as const) {
        const sys = t.sys[i], dia = t.dia[i], hr = t.hr[i];
        if (sys === null || dia === null || hr === null) continue;
        used = true; points++;
        VARIANTS.forEach((v, k) => {
          const e = estimateBp(cal, hr, v.slopes);
          errs[k].sys.push(e.sys - sys);
          errs[k].dia.push(e.dia - dia);
        });
      }
    }
    if (used) subjects++;
  }
  return {
    status: 'ok', ranAt: now.toISOString(), dataset: 'Pulse Transit Time PPG (PhysioNet), header values', license: 'ODbL 1.0', subjects, testPoints: points,
    method: 'Calibrate on the first seated recording of each person, then estimate blood pressure at the start and end of the walking and running recordings from heart rate.',
    estimator: { label: BP_ESTIMATOR.label, slopeSysPerBpm: BP_ESTIMATOR.slopeSysPerBpm, slopeDiaPerBpm: BP_ESTIMATOR.slopeDiaPerBpm, placeholder: true },
    variants: VARIANTS.map((v, k) => ({ id: v.id, label: v.label, sys: errorStats(errs[k].sys), dia: errorStats(errs[k].dia) })),
    notes: VALIDATION_NOTES,
  };
}

export function formatResult(r: ValidationResult): string {
  if (r.status === 'not-run') return r.method;
  const f = (x: number, d = 1) => (Number.isNaN(x) ? 'n/a' : x.toFixed(d));
  const lines = [
    `Dataset: ${r.dataset} (${r.license})`, `People: ${r.subjects}   test points: ${r.testPoints}`, `Estimator: ${r.estimator.label} (PLACEHOLDER)`, '',
    'variant'.padEnd(52) + 'BP'.padEnd(5) + 'n'.padEnd(5) + 'mean err'.padEnd(10) + 'SD'.padEnd(8) + 'MAE'.padEnd(8) + 'within 10',
  ];
  for (const v of r.variants) for (const [k, s] of [['SBP', v.sys], ['DBP', v.dia]] as const) {
    lines.push(v.label.padEnd(52) + k.padEnd(5) + String(s.n).padEnd(5) + `${f(s.meanError)} mmHg`.padEnd(10) + f(s.sd).padEnd(8) + f(s.mae).padEnd(8) + `${f(s.pctWithin10, 0)} %`);
  }
  lines.push('', ...r.notes.map((n) => `Note: ${n}`));
  return lines.join('\n');
}
