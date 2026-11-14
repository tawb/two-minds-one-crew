// Population reference ranges by age band and sex. These are DESCRIPTIVE ranges, not clinical limits and not alert thresholds.
//
// Where they come from:
//   resting heart rate, HRV (RMSSD): the 5th to 95th percentile of a sample of the Autonomic Aging dataset
//     (PhysioNet, ODbL 1.0), computed by `npm run fetch-data` into public/replay/aging-reference.json.
//     Used only for an age band and sex with at least `minSampleN` people.
//   everything else, and everything when that file is missing: PLACEHOLDER numbers below. Each is marked TODO(flight-surgeon).
//     They are plain round numbers chosen to make the pipeline work. They are not guidelines and not NASA limits.

import { SIM } from '../sim/params';
import { READINGS_CONFIG } from './config';

export type RefMetric = 'resting_hr' | 'hrv_rmssd' | 'bp_systolic' | 'bp_diastolic' | 'glucose' | 'sleep' | 'skin_temp';
export type Sex = 'female' | 'male';

export interface RefRange {
  metric: RefMetric;
  low: number;
  high: number;
  median: number | null;
  unit: string;
  basis: 'autonomic-aging' | 'placeholder';
  /** How many people the band is based on (public data only). */
  n: number | null;
  /** Text shown to the user. */
  label: string;
  source: string;
}

export interface AgingBand {
  ageMin: number; ageMax: number; sex: Sex; n: number;
  hr: { p5: number; median: number; p95: number };
  rmssd: { p5: number; median: number; p95: number };
}
export interface AgingReference { source: string; method: string; limits: string; used: number; dropped: number; bands: AgingBand[] }

const UNIT: Record<RefMetric, string> = { resting_hr: 'bpm', hrv_rmssd: 'ms', bp_systolic: 'mmHg', bp_diastolic: 'mmHg', glucose: 'mg/dL', sleep: 'h', skin_temp: '°C' };

/** PLACEHOLDERS. TODO(flight-surgeon): replace every number with a sourced, age- and sex-banded reference. */
const PLACEHOLDER: Record<RefMetric, { low: number; high: number }> = {
  resting_hr: { low: 50, high: 95 }, // TODO(flight-surgeon)
  hrv_rmssd: { low: 15, high: 80 }, // TODO(flight-surgeon)
  bp_systolic: { low: 95, high: 130 }, // TODO(flight-surgeon)
  bp_diastolic: { low: 60, high: 85 }, // TODO(flight-surgeon)
  sleep: { low: SIM.thresholds.shortSleepH, high: 24 }, // TODO(flight-surgeon): demonstration value from params.ts, not a sleep requirement
  skin_temp: { low: 28, high: SIM.thresholds.skinTempVerify }, // TODO(flight-surgeon): wrist skin trend, not a core temperature
  glucose: { low: READINGS_CONFIG.glucose.bandLowMgDl, high: READINGS_CONFIG.glucose.bandHighMgDl }, // TODO(flight-surgeon) healthy-adult band, not a diabetes threshold
};

const placeholder = (m: RefMetric): RefRange => ({
  metric: m, ...PLACEHOLDER[m], median: null, unit: UNIT[m], basis: 'placeholder', n: null,
  label: 'placeholder range, not sourced', source: 'TODO(flight-surgeon): needs a sourced reference',
});

export const bandOf = (age: number, sex: Sex, ref: AgingReference | null | undefined): AgingBand | null =>
  ref?.bands.find((b) => b.sex === sex && age >= b.ageMin && age <= b.ageMax) ?? null;

/** The reference range for a metric, a person's age and sex. Data-derived where the sample is big enough, a marked placeholder otherwise. */
export function referenceFor(metric: RefMetric, age: number | null, sex: Sex | null, aging?: AgingReference | null, minN: number = READINGS_CONFIG.reference.minSampleN): RefRange {
  if ((metric === 'resting_hr' || metric === 'hrv_rmssd') && age !== null && sex !== null) {
    const band = bandOf(age, sex, aging);
    if (band && band.n >= minN) {
      const v = metric === 'resting_hr' ? band.hr : band.rmssd;
      return {
        metric, low: Math.round(v.p5), high: Math.round(v.p95), median: Math.round(v.median), unit: UNIT[metric], basis: 'autonomic-aging', n: band.n,
        label: `population reference: ${sex}, ${band.ageMin} to ${band.ageMax} years (n=${band.n}, Autonomic Aging sample)`,
        source: aging!.source,
      };
    }
  }
  return placeholder(metric);
}
