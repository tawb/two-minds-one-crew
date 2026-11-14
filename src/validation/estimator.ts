// PLACEHOLDER cuffless blood-pressure estimator. The app has no real cuffless estimator: its displayed blood pressure
// always comes from the upper-arm cuff. This exists only so the validation pipeline has something to run.
//
//   estimate = calibration reading + slope x (heart rate now - heart rate at calibration)
//
// "Baseline plus calibration offset" in the plainest form: start from what the cuff measured at the last calibration and
// move with the heart rate. The slopes are made-up placeholders, TODO(flight-surgeon) / TODO(algorithm): fit or replace.

export const BP_ESTIMATOR = {
  label: 'Placeholder: calibration reading + heart-rate slope',
  /** mmHg per bpm. PLACEHOLDER values, not fitted to any data. */
  slopeSysPerBpm: 0.3, // TODO(flight-surgeon)
  slopeDiaPerBpm: 0.1, // TODO(flight-surgeon)
} as const;

export interface BpCalibration { sys: number; dia: number; hr: number }
export interface BpEstimate { sys: number; dia: number }

export function calibrate(sys: number, dia: number, hr: number): BpCalibration {
  return { sys, dia, hr };
}

export function estimateBp(cal: BpCalibration, hr: number, slopes: { sys: number; dia: number } = { sys: BP_ESTIMATOR.slopeSysPerBpm, dia: BP_ESTIMATOR.slopeDiaPerBpm }): BpEstimate {
  return { sys: cal.sys + slopes.sys * (hr - cal.hr), dia: cal.dia + slopes.dia * (hr - cal.hr) };
}
