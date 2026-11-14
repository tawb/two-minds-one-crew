import { describe, expect, it } from 'vitest';
import { SimEngine } from './engine';
import { reading, seriesOf } from './selectors';
import { REGIONS, compare, regionFlag, regionReports, vital, vitals } from './vitals';

function make(scenario = 'routine') {
  const e = new SimEngine({ persist: null, online: () => true });
  e.loadScenario(scenario);
  e.S.ready = true;
  return e;
}
const hrCount = (e: SimEngine, aid = 'A1') => seriesOf(e.S.series, aid, 'heart_rate').length;
const openAlerts = (e: SimEngine) => [...e.S.alerts.values()].filter((a) => a.status === 'open');

describe('seeding (zero typing)', () => {
  it('preloads crew history, a recent BP result, sleep, check-ins and Earth records', () => {
    const e = make();
    for (const aid of ['A1', 'A2', 'A3', 'A4']) {
      expect(seriesOf(e.S.series, aid, 'heart_rate').length).toBeGreaterThan(150);
      const bp = reading(e.S.series, e.S.superseded, e.S.now, aid, 'bp_systolic');
      expect(bp.obs).not.toBeNull();
      expect(bp.ageMs).toBeLessThan(15 * 60_000);
      expect(seriesOf(e.S.series, aid, 'sleep').length).toBeGreaterThanOrEqual(3);
      expect(seriesOf(e.S.series, aid, 'mood').length).toBeGreaterThanOrEqual(3);
    }
    expect(e.S.earth.size).toBeGreaterThan(1000);
    expect(e.S.outbox.length).toBe(0);
  });

  it('is repeatable', () => {
    const a = make('headache-co2'), b = make('headache-co2');
    a.advance(120_000); b.advance(120_000);
    const pick = (e: SimEngine) => seriesOf(e.S.series, 'A2', 'heart_rate').slice(-5).map((o) => o.value);
    expect(pick(a)).toEqual(pick(b));
  });

  it('every observation has the required fields and a unique id', () => {
    const e = make();
    e.advance(60_000);
    const ids = new Set<string>();
    for (const arr of e.S.series.values()) for (const o of arr) {
      expect(ids.has(o.id)).toBe(false);
      ids.add(o.id);
      expect(o.subjectId && o.metric && o.units && o.deviceId && o.quality && o.origin).toBeTruthy();
      expect(typeof o.measuredAt).toBe('number');
      if (o.value === null) expect(o.quality).toBe('missing');
    }
  });
});

describe('automatic monitoring', () => {
  it('pulse every 5 s, skin temperature every minute, cabin every 10 s', () => {
    const e = make();
    const h = hrCount(e), t = seriesOf(e.S.series, 'A1', 'skin_temp').length, c = seriesOf(e.S.series, 'M1', 'co2').length;
    e.advance(60_000);
    expect(hrCount(e) - h).toBe(12);
    expect(seriesOf(e.S.series, 'A1', 'skin_temp').length - t).toBe(1);
    expect(seriesOf(e.S.series, 'M1', 'co2').length - c).toBe(6);
  });

  it('scheduled cuff cycle produces a reading only after it completes', () => {
    const e = make();
    const before = seriesOf(e.S.series, 'A4', 'bp_systolic').length;
    e.advance(40_000); // cycle started at +30 s, lasts 45 s
    expect(e.S.cuff.A4.phase).not.toBe('idle');
    expect(seriesOf(e.S.series, 'A4', 'bp_systolic').length).toBe(before);
    e.advance(40_000);
    expect(e.S.cuff.A4.phase).toBe('completed');
    expect(seriesOf(e.S.series, 'A4', 'bp_systolic').length).toBe(before + 1);
  });

  it('manual cuff: cancel records nothing; injected failure records a missing result and a device message', () => {
    const e = make();
    const n = () => seriesOf(e.S.series, 'A1', 'bp_systolic').length;
    const before = n();
    e.startCuff('A1', 'manual');
    e.advance(10_000);
    e.cancelCuff('A1');
    expect(e.S.cuff.A1.phase).toBe('cancelled');
    expect(n()).toBe(before);
    e.setInjectCuffFail(true);
    e.startCuff('A1', 'manual');
    e.advance(40_000);
    expect(e.S.cuff.A1.phase).toBe('failed');
    const last = seriesOf(e.S.series, 'A1', 'bp_systolic').at(-1)!;
    expect(last.value).toBeNull();
    expect(last.quality).toBe('missing');
    expect([...e.S.deviceMsgs.values()].some((m) => m.kind === 'cuff-failed' && m.active)).toBe(true);
    const lv = reading(e.S.series, e.S.superseded, e.S.now, 'A1', 'bp_systolic');
    expect(lv.obs).not.toBeNull(); // last valid time preserved
    expect(lv.state).toBe('missing');
  });
});

describe('Earth synchronization', () => {
  it('delivers new records to Earth with original timestamps', () => {
    const e = make();
    e.advance(30_000);
    const on = seriesOf(e.S.series, 'A1', 'heart_rate').at(-12)!;
    const er = e.S.earth.get(on.id)!;
    expect(er).toBeDefined();
    expect(er.rec.obs!.measuredAt).toBe(on.measuredAt);
    expect(er.receivedAt).toBeGreaterThan(on.measuredAt);
  });

  it('outage: onboard keeps monitoring and alerting, Earth goes stale, recovery delivers once', () => {
    const e = make('comms-loss');
    e.advance(15_000);
    expect(e.S.linkUp).toBe(false);
    const hr0 = hrCount(e);
    const earthHr0 = seriesOf(e.S.earthSeries, 'A1', 'heart_rate').length;
    e.advance(80_000); // outage runs to +110 s
    expect(hrCount(e) - hr0).toBe(16);
    expect(seriesOf(e.S.earthSeries, 'A1', 'heart_rate').length).toBe(earthHr0);
    expect(e.S.outbox.length).toBeGreaterThan(100);
    // elevated cuff result raised an onboard alert while Earth could not hear it
    const onboardBp = openAlerts(e).find((a) => a.kind === 'vital' && a.subjectId === 'A4');
    expect(onboardBp).toBeDefined();
    expect([...e.S.earthAlerts.values()].some((x) => x.alert.id === onboardBp!.id)).toBe(false);
    const queuedIds = e.S.outbox.map((i) => i.rec.id);

    e.advance(60_000); // recovery at +110 s, then delivery
    expect(e.S.linkUp).toBe(true);
    expect(e.S.outbox.length).toBeLessThan(40);
    e.advance(60_000);
    expect(e.S.outbox.length).toBeLessThan(40);
    for (const id of queuedIds.slice(0, 50)) {
      const er = e.S.earth.get(id)!;
      expect(er).toBeDefined();
      expect(er.rec.at).toBeLessThan(er.receivedAt);
    }
    expect([...e.S.earthAlerts.values()].some((x) => x.alert.id === onboardBp!.id)).toBe(true);
    expect(e.S.earth.size).toBe(new Set(e.S.earth.keys()).size);
  });

  it('retries after a lost acknowledgement are rejected as duplicates and still acknowledged', () => {
    const e = make();
    e.setDelay(15_000);
    e.advance(20_000); // some records delivered, acks (30 s) not yet back
    const delivered = [...e.S.outbox].filter((i) => i.attemptDelivered).length;
    expect(delivered).toBeGreaterThan(0);
    e.setCommsEnabled(false);
    e.advance(5_000);
    e.setCommsEnabled(true);
    e.advance(120_000);
    expect(e.S.dupRejected).toBeGreaterThan(0);
    const ids = [...e.S.earth.keys()];
    expect(new Set(ids).size).toBe(ids.length);
    expect(e.S.outbox.length).toBeLessThan(10 * 12); // everything older than the delay window is acknowledged
  });

  it('receipt is distinct from review', () => {
    const e = make('headache-co2');
    e.advance(30_000);
    const id = [...e.S.earthAlerts.values()].find((x) => x.alert.kind === 'symptom')!.alert.id;
    expect(e.S.earthReview[id].status).toBe('received');
    e.earthSetReview(id, 'under-review');
    expect(e.S.earthReview[id].status).toBe('under-review');
  });
});

describe('scenarios', () => {
  const symptom = (e: SimEngine) => [...e.S.alerts.values()].find((a) => a.kind === 'symptom')!;

  it('headache + CO₂ in own module: context available, cause undetermined, simulated self-report preserved', () => {
    const e = make('headache-co2');
    e.advance(20_000);
    const a = symptom(e);
    expect(a.level).toBe('review');
    expect(a.contextNote).toBe('Environmental context available for review');
    expect(a.lines.join(' ')).toMatch(/undetermined/);
    expect(a.lines.join(' ')).toMatch(/Hab Module 2/);
    const o = e.S.byId.get(a.evidence[0])!;
    expect(o.origin).toBe('simulated-self-report');
    expect(o.meta?.simulatedSelfReport).toBe(true);
    expect(seriesOf(e.S.series, 'A2', 'fatigue').at(-1)!.origin).toBe('simulated-self-report');
    e.advance(10_000);
    expect([...e.S.earthAlerts.values()].some((x) => x.alert.id === a.id)).toBe(true);
  });

  it('stale CO₂ is explained as unavailable/stale, not as context', () => {
    const e = make('headache-stale');
    e.advance(20_000);
    const a = symptom(e);
    expect(a.contextNote).toBe('Environmental context unavailable or stale');
    expect(a.lines.join(' ')).toMatch(/last valid reading/);
    expect([...e.S.deviceMsgs.values()].some((m) => m.deviceId === 'CAB-M2' && m.active)).toBe(true);
  });

  it('CO₂ from another module is identified as a location mismatch', () => {
    const e = make('headache-other-module');
    e.advance(20_000);
    const a = symptom(e);
    expect(a.contextNote).not.toBe('Environmental context available for review');
    expect(a.lines.join(' ')).toMatch(/Laboratory Module.*different location/);
  });

  it('disconnected wearable shows unavailable data, a device message, and help still works', () => {
    const e = make('wearable-help');
    e.advance(60_000);
    expect(e.S.devices['BAND-A3'].state).toBe('disconnected');
    const r = reading(e.S.series, e.S.superseded, e.S.now, 'A3', 'heart_rate');
    expect(r.state).toBe('missing');
    expect(r.obs).not.toBeNull();
    expect([...e.S.deviceMsgs.values()].some((m) => m.deviceId === 'BAND-A3' && m.active)).toBe(true);
    const help = [...e.S.alerts.values()].find((a) => a.kind === 'help')!;
    expect(help.level).toBe('help');
    expect(help.lines.join(' ')).toMatch(/device not reporting/);
  });

  it('help request works with no readings at all', () => {
    const e = make();
    e.S.series.clear();
    const a = e.requestHelp('A1');
    expect(a.level).toBe('help');
    expect(a.lines.join(' ')).toMatch(/unavailable/);
  });
});

describe('manual entry and corrections', () => {
  it('manual values keep origin "manual"; corrections link to and supersede the original', () => {
    const e = make();
    const o = e.addManual('A1', 'glucose', 101, 'typed');
    expect(o.origin).toBe('manual');
    const c = e.correct(o.id, 99)!;
    expect(c.correctionOf).toBe(o.id);
    expect(e.S.superseded.has(o.id)).toBe(true);
    expect(reading(e.S.series, e.S.superseded, e.S.now, 'A1', 'glucose').obs!.id).not.toBe(o.id);
    const x = e.correct(c.id, null)!;
    expect(x.quality).toBe('excluded');
    expect(x.value).toBeNull();
  });
});

// In-memory stand-in for IndexedDB with the same load/save/clear contract.
class MemPersist {
  stores: Record<string, Map<string, any>> = {};
  meta: Record<string, unknown> | null = null;
  fail = false;
  private st(n: string) { return (this.stores[n] ??= new Map()); }
  private key(n: string, item: any) { return n === 'outbox' || n === 'earth' ? item.rec.id : item.id; }
  async load() {
    const all = (n: string) => [...this.st(n).values()];
    return { observations: all('observations'), alerts: all('alerts'), deviceMsgs: all('deviceMsgs'), outbox: all('outbox'), earth: all('earth'), meta: this.meta, legacyViewer: null } as any;
  }
  async save(b: any) {
    if (this.fail) throw new Error('quota exceeded');
    for (const [n, items] of Object.entries(b.put ?? {})) for (const it of items as any[]) this.st(n).set(this.key(n, it), structuredClone(it));
    for (const [n, ids] of Object.entries(b.del ?? {})) for (const id of ids as string[]) this.st(n).delete(id);
    if (b.meta) this.meta = structuredClone(b.meta);
  }
  async clear() { this.stores = {}; this.meta = null; }
}

async function persisted(scenario: string, mem = new MemPersist()) {
  const e = new SimEngine({ persist: mem as any, online: () => true });
  await e.start();
  if (scenario !== 'routine') e.loadScenario(scenario);
  return { e, mem };
}

describe('persistence', () => {
  it('reload restores records, pending transmissions and clock; resent items are deduplicated', async () => {
    const { e, mem } = await persisted('comms-loss');
    for (let i = 0; i < 20; i++) { e.advance(5_000); await e.flush(); }
    expect(e.S.linkUp).toBe(false);
    const queued = e.S.outbox.length;
    expect(queued).toBeGreaterThan(50);
    const now = e.S.now, earthSize = e.S.earth.size, obsCount = e.S.byId.size;
    e.stop();

    const e2 = new SimEngine({ persist: mem as any, online: () => true });
    await e2.start();
    expect(e2.S.now).toBe(now);
    expect(e2.S.scenarioId).toBe('comms-loss');
    expect(e2.S.byId.size).toBe(obsCount);
    expect(e2.S.earth.size).toBe(earthSize);
    expect(e2.S.outbox.length).toBe(queued);
    expect(e2.S.comms.enabled).toBe(false);
    e2.setCommsEnabled(true);
    for (let i = 0; i < 6; i++) { e2.advance(10_000); await e2.flush(); }
    expect(e2.S.outbox.length).toBeLessThan(queued);
    const ids = [...e2.S.earth.keys()];
    expect(new Set(ids).size).toBe(ids.length);
    e2.stop();
  });

  it('storage failure is surfaced, records are held (not queued) and recovered when storage works again', async () => {
    const { e, mem } = await persisted('routine');
    await e.flush();
    const q0 = e.S.outbox.length;
    mem.fail = true;
    e.advance(30_000);
    await e.flush();
    expect(e.S.storageError).toMatch(/Local storage failed/);
    expect(e.S.unsavedCount).toBeGreaterThan(0);
    expect(e.S.outbox.length).toBe(q0); // nothing queued before it is saved locally
    mem.fail = false;
    await e.flush();
    expect(e.S.storageError).toBeNull();
    expect(e.S.unsavedCount).toBe(0);
    expect(e.S.outbox.length).toBeGreaterThan(q0);
    e.stop();
  });
});

describe('simple flow: measure, vitals cards, body regions', () => {
  it('measureNow generates every vital from the sensors with origin, device and time', () => {
    const e = make();
    e.advance(7_000);
    e.measureNow('A1');
    expect(e.S.lastMeasure.A1).toBe(e.S.now);
    const cards = vitals(e.S, 'A1');
    expect(cards.map((c) => c.key)).toEqual(['pulse', 'bp', 'temp', 'glucose', 'sleep', 'air']);
    for (const c of cards) expect(c.value).not.toBeNull();
    const bp = vital(e.S, 'A1', 'bp');
    expect(bp.obs!.measuredAt).toBe(e.S.now);
    expect(bp.obs!.meta?.cycle).toBe('on-demand');
    expect(bp.obs!.deviceId).toBe('CUFF-A1');
    expect(e.S.outbox.length).toBeGreaterThan(0); // measurement is queued for Earth like any other record
  });

  it('measureNow with a disconnected band / cuff shows explicit missing values, not made-up numbers', () => {
    const e = make();
    e.setDevice('BAND-A2', 'disconnected');
    e.setDevice('CUFF-A2', 'disconnected');
    e.advance(10_000);
    e.measureNow('A2');
    const pulse = vital(e.S, 'A2', 'pulse');
    expect(pulse.state).toBe('missing');
    expect(pulse.obs).not.toBeNull(); // last valid value kept with its original time
    expect(pulse.obs!.measuredAt).toBeLessThan(e.S.now);
    const bp = vital(e.S, 'A2', 'bp');
    expect(bp.state).toBe('missing');
    expect(seriesOf(e.S.series, 'A2', 'bp_systolic').at(-1)!.meta?.failure).toMatch(/not connected/);
  });

  it('flags use the simulation parameters', () => {
    const e = make('headache-co2');
    e.advance(20_000);
    expect(vital(e.S, 'A2', 'air').flag).toBe('verify');
    expect(vital(e.S, 'A2', 'sleep').flag).toBe('verify');
    expect(vital(e.S, 'A1', 'air').flag).toBe('ok');
    e.addManualBp('A1', 150, 95);
    expect(vital(e.S, 'A1', 'bp').flag).toBe('verify');
  });

  it('a report on a body part keeps its region and shows on the map marker', () => {
    const e = make();
    expect(regionFlag(e.S, 'A1', 'leftLeg').flag).toBe('ok');
    const o = e.reportSymptom('A1', { symptom: 'Cramp', severity: 2, onsetAt: e.S.now, origin: 'manual', region: 'leftLeg' });
    expect(o.meta?.region).toBe('leftLeg');
    expect(o.origin).toBe('manual');
    expect(regionReports(e.S, 'A1', 'leftLeg')).toHaveLength(1);
    expect(regionFlag(e.S, 'A1', 'leftLeg').reports).toBe(1);
    expect(regionFlag(e.S, 'A1', 'rightLeg').reports).toBe(0);
    expect(Object.keys(REGIONS)).toHaveLength(7);
  });
});

describe('compare: now vs previous, on board vs on Earth', () => {
  it('previous is the earlier measurement session; change is computed from it', () => {
    const e = make();
    e.advance(7_000);
    e.measureNow('A1');
    const first = e.S.now;
    e.advance(90_000);
    e.measureNow('A1');
    expect(e.S.measureLog.A1).toEqual([first, e.S.now]);
    const c = compare(e.S, 'A1', 'pulse');
    expect(c.board.prevAt).not.toBeNull();
    expect(c.board.prevAt!).toBeLessThanOrEqual(first);
    expect(c.board.delta).toBe(Number(c.board.now) - Number(c.board.prev));
  });

  it('falls back to ~30 min earlier when there was no earlier session', () => {
    const e = make();
    e.advance(5_000);
    const c = compare(e.S, 'A2', 'glucose');
    expect(c.board.prev).not.toBeNull();
    expect(c.board.nowAt! - c.board.prevAt!).toBeGreaterThanOrEqual(30 * 60_000);
  });

  it('Earth matches once delivered and is flagged as behind during an outage, with its own previous value', () => {
    const e = make();
    e.advance(30_000);
    e.measureNow('A1');
    e.advance(10_000);
    let c = compare(e.S, 'A1', 'bp');
    expect(c.behind).toBe(false);
    expect(c.earth.now).toBe(c.board.now);
    expect(c.earthReceivedAt).not.toBeNull();

    e.setCommsEnabled(false);
    e.advance(5_000);
    e.measureNow('A1'); // a new reading that cannot reach Earth
    e.advance(5_000);
    c = compare(e.S, 'A1', 'bp');
    expect(c.behind).toBe(true);
    expect(c.earth.nowAt!).toBeLessThan(c.board.nowAt!);
    expect(c.earth.prevAt === null || c.earth.prevAt! < c.earth.nowAt!).toBe(true);

    e.setCommsEnabled(true);
    e.advance(30_000);
    c = compare(e.S, 'A1', 'bp');
    expect(c.behind).toBe(false);
    expect(c.earth.now).toBe(c.board.now);
  });
});
