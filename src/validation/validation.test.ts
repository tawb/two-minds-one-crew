import { describe, expect, it } from 'vitest';
import { calibrate, estimateBp } from './estimator';
import { parsePttHeader } from './ptt';
import { formatResult, notRun, validateOnPtt } from './run';
import { errorStats } from './stats';

const hea = (n: string, act: string, sys: [number, number], dia: [number, number], hr: [number, number]) =>
  `${n} 18 500 1000\n# <filename>: ${n} <activity>: ${act} <gender>: female <height>: 160 <weight>: 50 <age>: 25 <bp_sys_start>: ${sys[0]} <bp_sys_end>: ${sys[1]} <bp_dia_start>: ${dia[0]} <bp_dia_end>: ${dia[1]} <hr_1_start>: ${hr[0]} <hr_2_start>: ${hr[0] + 2} <hr_1_end>: ${hr[1]} <hr_2_end>: ${hr[1] + 2} <spo2_start>: 98 <spo2_end>: 98`;

describe('PTT header parser', () => {
  it('reads activity, sex, age, BP and the mean heart rate', () => {
    const r = parsePttHeader(hea('s3_walk', 'walk', [100, 96], [70, 66], [80, 90]))!;
    expect(r).toMatchObject({ rec: 's3_walk', subject: 3, activity: 'walk', sex: 'female', age: 25, sys: [100, 96], dia: [70, 66], hr: [81, 91] });
  });
  it('returns null for something that is not a header', () => expect(parsePttHeader('garbage')).toBeNull());
  it('keeps missing values as null', () => {
    const r = parsePttHeader('x 1 1 1\n# <filename>: s1_sit <activity>: sit <gender>: male <age>: 30')!;
    expect(r.sys).toEqual([null, null]);
    expect(r.hr).toEqual([null, null]);
  });
});

describe('error statistics', () => {
  it('computes mean error, SD and percent within 10 mmHg', () => {
    const s = errorStats([2, -2, 12, -12]);
    expect(s.n).toBe(4);
    expect(s.meanError).toBe(0);
    expect(s.mae).toBe(7);
    expect(s.pctWithin10).toBe(50);
    expect(s.sd).toBeCloseTo(Math.sqrt((4 + 4 + 144 + 144) / 3), 6);
  });
  it('handles an empty list without throwing', () => expect(errorStats([]).n).toBe(0));
});

describe('placeholder estimator', () => {
  it('equals the calibration reading when the heart rate has not changed', () => {
    expect(estimateBp(calibrate(118, 76, 70), 70)).toEqual({ sys: 118, dia: 76 });
  });
  it('moves with the heart rate using the slopes', () => {
    expect(estimateBp(calibrate(100, 60, 60), 80, { sys: 0.5, dia: 0.25 })).toEqual({ sys: 110, dia: 65 });
  });
});

describe('validation run', () => {
  const recs = [
    parsePttHeader(hea('s1_sit', 'sit', [100, 100], [60, 60], [60, 60]))!,
    parsePttHeader(hea('s1_walk', 'walk', [104, 98], [62, 60], [60, 60]))!,
    parsePttHeader(hea('s1_run', 'run', [100, 100], [60, 60], [60, 60]))!,
  ];
  it('calibrates on sit and tests on walk and run', () => {
    const r = validateOnPtt(recs, new Date('2026-11-14T00:00:00Z'));
    expect(r).toMatchObject({ status: 'ok', subjects: 1, testPoints: 4 });
    const cal = r.variants.find((v) => v.id === 'calibration-only')!;
    expect(cal.sys.n).toBe(4);
    expect(cal.sys.meanError).toBeCloseTo((-4 + 2 + 0 + 0) / 4, 6);
    expect(r.estimator.placeholder).toBe(true);
  });
  it('states that the estimator is a placeholder and ICU data is not for thresholds', () => {
    const text = formatResult(validateOnPtt(recs));
    expect(text).toContain('PLACEHOLDER');
    expect(text.toLowerCase()).toContain('not a source of astronaut thresholds');
  });
  it('skips people with no seated calibration', () => expect(validateOnPtt(recs.slice(1)).subjects).toBe(0));
  it('the not-run result says how to run it', () => expect(notRun().method).toContain('validate:bp'));
});
