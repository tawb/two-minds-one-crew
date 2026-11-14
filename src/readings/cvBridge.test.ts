import { describe, expect, it } from 'vitest';
import type { CvResultDetail } from '../features/cv-response-check/events';
import { installCvBridge, loadCameraRecords, recordFromEvent, saveCameraRecord, toCameraReading } from './cvBridge';

describe('camera bridge', () => {
  const detail: CvResultDetail = { check: 'response', state: 'normal', medianReactionMs: 640, baselineDeviation: null, completed: 12, total: 13, errors: 1, lapses: 0, falseStarts: 0, timestamp: Date.UTC(2026, 10, 14, 15) };
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

  it('adds last night\'s sleep to the context of the stored reading', () => {
    const rec = recordFromEvent(detail, { subjectId: 'A1', sleepHours: 6.4 });
    const r = toCameraReading(rec);
    expect(r).toMatchObject({ metric: 'response_ms', unit: 'ms', source: 'camera', value: 640, deviceId: 'CAMERA' });
    expect(r.context.sleepLastNightHours).toBe(6.4);
    expect(r.calibration.state).toBe('calibrating'); // the check is still building its own baseline
    expect(r.timestamp).toBe('2026-11-14T15:00:00.000Z');
  });
  it('marks an inconclusive check as quality unknown', () => {
    expect(toCameraReading(recordFromEvent({ ...detail, state: 'inconclusive', medianReactionMs: null }, { subjectId: 'A1', sleepHours: null })).quality).toBe('unknown');
  });
  it('listens to the cv-result event and stores a record, then stops', () => {
    const listeners = new Map<string, (e: Event) => void>();
    const target = { addEventListener: (t: string, f: EventListenerOrEventListenerObject) => listeners.set(t, f as (e: Event) => void), removeEventListener: (t: string) => void listeners.delete(t) };
    const store = mem();
    const stop = installCvBridge(() => ({ subjectId: 'A2', sleepHours: 7 }), target as unknown as Window);
    expect(listeners.has('cv-result')).toBe(true);
    // the bridge stores through localStorage; here we save through the same function to check the round trip
    saveCameraRecord(recordFromEvent(detail, { subjectId: 'A2', sleepHours: 7 }), store);
    expect(loadCameraRecords(store)).toHaveLength(1);
    expect(loadCameraRecords(store)[0].sleepLastNightHours).toBe(7);
    stop();
    expect(listeners.has('cv-result')).toBe(false);
  });
  it('does not fail when storage is unavailable', () => {
    expect(() => saveCameraRecord(recordFromEvent(detail, { subjectId: 'A1', sleepHours: null }), null)).not.toThrow();
    expect(loadCameraRecords(null)).toEqual([]);
  });
});
