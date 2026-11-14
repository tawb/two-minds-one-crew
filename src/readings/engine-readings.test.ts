import { describe, expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { lastValid } from '../sim/selectors';
import { badgesOf, readingOf } from './view';

function make() {
  const e = new SimEngine({ persist: null, online: () => true });
  e.loadScenario('routine');
  e.S.ready = true;
  return e;
}

describe('engine + reading model', () => {
  it('attaches context to every new reading and keeps the session tag', () => {
    const e = make();
    e.setContext('A1', { posture: 'standing' });
    e.measureNow('A1');
    const hr = lastValid(e.S.series, e.S.superseded, 'A1', 'heart_rate')!;
    expect(hr.ctx?.posture).toBe('standing'); // the astronaut's entry wins
    expect(hr.ctx?.sleepHours).not.toBeNull(); // filled from the schedule
    expect(hr.meta?.session).toBeTruthy();
  });
  it('a reading is never blocked by unknown context', () => {
    const e = make();
    e.measureNow('A2');
    expect(lastValid(e.S.series, e.S.superseded, 'A2', 'heart_rate')).not.toBeNull();
  });
  it('shows calibration age on blood pressure, stale for the 33 day account', () => {
    const e = make();
    const t = (aid: string) => badgesOf(e.S, aid, lastValid(e.S.series, e.S.superseded, aid, 'bp_systolic')).find((b) => b.key === 'cal')!.text;
    expect(t('A2')).toBe('calibration 24 days old');
    expect(t('A3')).toContain('needs calibration');
  });
  it('calibrating resets the age', () => {
    const e = make();
    e.calibrateBp('A3');
    const r = readingOf(e.S, 'A3', lastValid(e.S.series, e.S.superseded, 'A3', 'bp_systolic'))!;
    expect(r.calibration.state).toBe('calibrated');
    expect(r.calibration.daysSince).toBe(0);
  });
});
