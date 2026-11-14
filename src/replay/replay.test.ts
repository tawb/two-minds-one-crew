import { describe, expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { seriesOf } from '../sim/selectors';
import { toReading } from '../readings/model';
import { loadDatasets } from './datasets';
import { advance, nextBpFrame } from './player';
import { syntheticDay } from './synthetic';
import type { ReplayDataset } from './types';

const mini = (): ReplayDataset => ({
  id: 'mini', title: 'Mini', kind: 'public', description: '', attribution: 'x', license: 'x', limits: '', durationMs: 10_000,
  frames: [1000, 4000, 7000, 10_000].map((t, i) => ({
    t, hr: 60 + i, ...(i === 2 ? { sys: 120, dia: 80 } : {}), quality: i === 1 ? 'motion' : 'good', posture: 'seated', exerciseMinAgo: null, mealMinAgo: 30, sleepHours: null,
  })),
});

describe('player', () => {
  it('returns frames inside the window and keeps position', () => {
    const a = advance(mini(), 0, 5000, false);
    expect(a.frames.map((f) => f.t)).toEqual([1000, 4000]);
    expect(a.posMs).toBe(5000);
    expect(a.ended).toBe(false);
  });
  it('stops at the end without loop', () => {
    const a = advance(mini(), 8000, 5000, false);
    expect(a.frames.map((f) => f.t)).toEqual([10_000]);
    expect(a.ended).toBe(true);
  });
  it('wraps with loop and replays the first frame', () => {
    const a = advance(mini(), 8000, 5000, true);
    expect(a.wrapped).toBe(true);
    expect(a.frames.map((f) => f.t)).toEqual([10_000, 1000]);
    expect(a.ended).toBe(false);
  });
  it('finds the next cuff reading', () => {
    expect(nextBpFrame(mini(), 0)!.t).toBe(7000);
    expect(nextBpFrame(mini(), 7000)!.t).toBe(7000); // wraps to the first one
  });
});

describe('synthetic day', () => {
  it('is deterministic, marked synthetic and well-formed', () => {
    const a = syntheticDay(), b = syntheticDay();
    expect(a.frames).toEqual(b.frames);
    expect(a.kind).toBe('synthetic');
    expect(a.title.toLowerCase()).toContain('synthetic');
    expect(a.frames.length).toBe(1440);
    expect(a.frames.some((f) => f.quality === 'motion')).toBe(true);
    expect(a.frames.some((f) => f.quality === 'poor_fit')).toBe(true);
    expect(a.frames.some((f) => f.mealCarbsG)).toBe(true);
    expect(a.frames.filter((f) => f.sleep)).toHaveLength(1);
  });
});

describe('loader', () => {
  it('falls back to the synthetic day when nothing was downloaded', async () => {
    const none = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    const l = await loadDatasets('/', none);
    expect(l.map((d) => d.id)).toEqual(['synthetic']);
  });
  it('adds downloaded datasets listed in the manifest', async () => {
    const f = (async (u: string) => (String(u).endsWith('manifest.json')
      ? new Response(JSON.stringify({ files: ['mini.json'] }), { headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify(mini())))) as unknown as typeof fetch;
    const l = await loadDatasets('/', f);
    expect(l.map((d) => d.id)).toEqual(['synthetic', 'mini']);
  });
});

describe('replay through the engine pipeline', () => {
  function run(ds: ReplayDataset, steps: number) {
    const e = new SimEngine({ persist: null, online: () => true });
    e.loadScenario('routine');
    e.S.ready = true;
    e.startReplay(ds);
    e.setReplaySpeed(1);
    for (let i = 0; i < steps; i++) (e as unknown as { step(): void }).step();
    return e;
  }
  it('sets source replay, quality and context on every reading and labels it', () => {
    const e = run(mini(), 10);
    const hr = seriesOf(e.S.series, 'A1', 'heart_rate').filter((o) => o.origin === 'replay');
    expect(hr.length).toBe(4);
    const readings = hr.map((o) => toReading(o)!);
    expect(readings.every((r) => r.source === 'replay')).toBe(true);
    expect(readings.map((r) => r.quality)).toEqual(['good', 'motion', 'good', 'good']);
    expect(readings[0].context.minutesSinceMeal).toBe(30);
    expect(readings[0].deviceId.startsWith('REPLAY')).toBe(true);
  });
  it('pushes replayed readings into the store-and-forward outbox like live ones', () => {
    const e = run(mini(), 10);
    expect(e.S.outbox.some((i) => i.rec.obs?.origin === 'replay') || [...e.S.earth.values()].some((r) => r.rec.obs?.origin === 'replay')).toBe(true);
  });
  it('pauses and resumes', () => {
    const e = new SimEngine({ persist: null, online: () => true });
    e.loadScenario('routine'); e.S.ready = true;
    e.startReplay(mini()); e.setReplaySpeed(1);
    e.setReplayPlaying(false);
    for (let i = 0; i < 5; i++) (e as unknown as { step(): void }).step();
    expect(e.S.replay.posMs).toBe(0);
    e.setReplayPlaying(true);
    for (let i = 0; i < 2; i++) (e as unknown as { step(): void }).step();
    expect(e.S.replay.posMs).toBe(2000);
  });
  it('stops simulated devices for the replayed astronaut only, and stopping returns to live', () => {
    const e = run(mini(), 0);
    const before = seriesOf(e.S.series, 'A1', 'heart_rate').filter((o) => o.origin === 'simulated').length;
    const otherBefore = seriesOf(e.S.series, 'A2', 'heart_rate').length;
    for (let i = 0; i < 40; i++) (e as unknown as { step(): void }).step();
    expect(seriesOf(e.S.series, 'A1', 'heart_rate').filter((o) => o.origin === 'simulated').length).toBe(before);
    expect(seriesOf(e.S.series, 'A2', 'heart_rate').length).toBeGreaterThan(otherBefore);
    e.stopReplay();
    expect(e.S.replay.on).toBe(false);
  });
  it('Measure during replay plays on to the next cuff reading', () => {
    const e = run(mini(), 0);
    e.measureNow('A1');
    const bp = seriesOf(e.S.series, 'A1', 'bp_systolic').filter((o) => o.origin === 'replay');
    expect(bp).toHaveLength(1);
    expect(bp[0].value).toBe(120);
  });
});
