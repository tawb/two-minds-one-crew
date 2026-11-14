// Shared onboard state + Earth receiver simulation. One engine, one timer, used by every screen.
// Order of operations for every record: save locally -> queue -> transmit -> Earth acknowledges.

import { ASTRONAUTS, MODULES, astro, initialDevices, moduleOf, residents, subjectName } from './crew';
import { emptyInput, mergeContext } from '../readings/context';
import type { ContextInput, StoredContext } from '../readings/types';
import { advance, nextBpFrame } from '../replay/player';
import { replayIdle, type ReplayDataset, type ReplayFrame, type ReplayState } from '../replay/types';
import { fmtAge, fmtHM, fmtTime } from './fmt';
import { Gen } from './generator';
import { DAY, H, SIM, T_START, THINNABLE } from './params';
import type { Batch, IdbPersist, Loaded } from './persist';
import { SCHEMA } from './persist';
import { scenarioById } from './scenarios';
import { isValid, lastValid, reading, seriesOf, sk, type SeriesMap } from './selectors';
import {
  LEVEL_LABEL, METRIC_LABEL, UNITS,
  type Alert, type AlertKind, type CuffState, type Device, type DeviceMsg, type DeviceState,
  type EarthRec, type EarthReview, type EarthReviewStatus, type Level, type McRole, type Metric,
  type Obs, type Origin, type OutboxItem, type Quality, type Rec, type Speed, type MetaValue,
} from './types';

export interface SimState {
  ready: boolean;
  now: number;
  T0: number;
  speed: Speed;
  scenarioId: string;
  devices: Record<string, Device>;
  series: SeriesMap;
  byId: Map<string, Obs>;
  superseded: Set<string>;
  earthSuperseded: Set<string>;
  alerts: Map<string, Alert>;
  deviceMsgs: Map<string, DeviceMsg>;
  outbox: OutboxItem[];
  earth: Map<string, EarthRec>;
  earthSeries: SeriesMap;
  earthAlerts: Map<string, { alert: Alert; receivedAt: number }>;
  earthDevMsgs: Map<string, { msg: DeviceMsg; receivedAt: number }>;
  earthReview: Record<string, EarthReview>;
  comms: { enabled: boolean; delayMs: number };
  online: boolean;
  linkUp: boolean;
  cuff: Record<string, CuffState>;
  due: Record<string, number>;
  seq: number;
  viewerId: string;
  lastMeasure: Record<string, number>;
  measureLog: Record<string, number[]>;
  /** What each astronaut has entered about posture, exercise, meal and sleep. Unknown fields stay unknown. */
  contexts: Record<string, ContextInput>;
  /** How simulated readings are made: normal; a random mix with 2 or 3 vitals out of range per run; or all high / all low. */
  demoBias: DemoBias;
  /** The values each astronaut's out-of-range vitals are pushed to, until their next run. */
  runPlan: Record<string, RunPlan>;
  /** Replay of recorded public (or synthetic) data. Not persisted: a reload returns to the live simulation. */
  replay: ReplayState;
  /** When each astronaut's upper-arm cuff was last calibrated against a reference measurement (null = never). */
  bpCalibratedAt: Record<string, number | null>;
  mcRole: McRole;
  storageError: string | null;
  unsavedCount: number;
  injectCuffFail: boolean;
  lastSyncAt: number | null;
  lastAckAt: number | null;
  dupRejected: number;
  downlink: { alertId: string; text: string; arriveAt: number }[];
  eventsDone: string[];
  activeKeys: Record<string, string>;
}

export interface EngineOpts {
  persist?: IdbPersist | null; online?: () => boolean;
  /** Each Measure vitals run puts 2 or 3 vitals out of range at random (the app). Off by default so tests stay predictable. */
  mix?: boolean;
  /** Random source for the mix; replace in tests for repeatable runs. */
  random?: () => number;
}

const newDirty = () => ({
  observations: new Map<string, Obs>(), alerts: new Map<string, Alert>(), deviceMsgs: new Map<string, DeviceMsg>(),
  outbox: new Map<string, OutboxItem>(), earth: new Map<string, EarthRec>(),
  delObs: new Set<string>(), delOutbox: new Set<string>(), delEarth: new Set<string>(),
});

/** Physical metrics that carry a posture / exercise / meal / sleep context. */
export type DemoBias = 'mix' | 'normal' | 'high' | 'low';
export interface RunPlan { hr?: number; sys?: number; dia?: number; glucose?: number; temp?: number; sleep?: number }
const PHYSICAL = new Set<Metric>(['heart_rate', 'skin_temp', 'glucose', 'bp_systolic', 'bp_diastolic', 'sleep', 'activity']);

const PROCEDURE: Record<Level, string> = {
  logged: 'PLACEHOLDER — no action defined. Logged for later review.',
  verify: 'PLACEHOLDER — verify sensor placement and repeat the measurement. [Approved onboard procedure to be supplied by medical owners.]',
  review: 'PLACEHOLDER — onboard review by the designated crew medical role, then flight-surgeon review. [Approved procedure to be supplied.]',
  help: 'PLACEHOLDER — notify the designated crew medical role and the flight surgeon. [Approved procedure to be supplied.]',
};

interface AlertSpec {
  kind: AlertKind; subjectId: string; level: Level; title: string; lines: string[];
  evidence: string[]; contextNote?: string; simulated?: boolean;
}

export class SimEngine {
  S: SimState;
  gen: Gen;
  private persist: IdbPersist | null;
  private onlineFn: () => boolean;
  private version = 0;
  private listeners = new Set<() => void>();
  private fireTimer: ReturnType<typeof setTimeout> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReal = 0;
  private carry = 0;
  private realSeconds = 0;
  private flushCount = 0;
  private unsaved: Rec[] = [];
  private dirty = newDirty();
  private seeding = false;
  private wasUp = true;
  private flushing = false;
  private clearPending: Promise<void> | null = null;
  private started = false;
  private startupError: string | null = null;

  private mixDefault: boolean;
  private rand: () => number;

  constructor(opts: EngineOpts = {}) {
    this.mixDefault = opts.mix ?? false;
    this.rand = opts.random ?? Math.random;
    this.persist = opts.persist ?? null;
    this.onlineFn = opts.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    this.gen = new Gen(T_START, {});
    this.S = this.blankState();
  }

  // ───────────────────────── lifecycle ─────────────────────────

  private blankState(): SimState {
    return {
      ready: false, now: T_START, T0: T_START, speed: 1, scenarioId: 'routine',
      devices: initialDevices(), series: new Map(), byId: new Map(), superseded: new Set(), earthSuperseded: new Set(),
      alerts: new Map(), deviceMsgs: new Map(), outbox: [],
      earth: new Map(), earthSeries: new Map(), earthAlerts: new Map(), earthDevMsgs: new Map(), earthReview: {},
      comms: { enabled: true, delayMs: SIM.comms.delayOptionsMs[0] }, online: true, linkUp: true,
      cuff: {}, due: {}, seq: 0, viewerId: 'A1', lastMeasure: {}, measureLog: {}, contexts: {}, demoBias: this.mixDefault ? 'mix' : 'normal', runPlan: {}, replay: replayIdle(), bpCalibratedAt: {}, mcRole: 'surgeon', storageError: null, unsavedCount: 0,
      injectCuffFail: false, lastSyncAt: null, lastAckAt: null, dupRejected: 0, downlink: [],
      eventsDone: [], activeKeys: {},
    };
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    let loaded: Loaded | null = null;
    if (this.persist) {
      try {
        // A blocked or stalled database must never leave the app on a loading screen.
        loaded = await Promise.race([
          this.persist.load(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timed out after 4 s')), 4000)),
        ]);
      } catch (e) {
        this.persist = null; // continue in memory; records will not survive a reload
        loaded = null;
        this.startupError = `Local storage is unavailable (${e instanceof Error ? e.message : String(e)}). Monitoring continues, but records will not survive a reload.`;
      }
    }
    const meta = loaded?.meta;
    if (loaded && meta && meta.schema === SCHEMA && loaded.observations.length > 0) this.restore(loaded);
    else {
      this.loadScenario('routine', loaded?.legacyViewer ?? undefined);
    }
    this.S.ready = true;
    if (this.startupError) this.S.storageError = this.startupError;
    this.lastReal = performance.now();
    this.timer = setInterval(() => this.tick(), 250);
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => void this.flush());
      window.addEventListener('online', () => { this.S.online = true; this.bump(true); });
      window.addEventListener('offline', () => { this.S.online = false; this.bump(true); });
    }
    this.S.online = this.onlineFn();
    this.bump(true);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.fireTimer) clearTimeout(this.fireTimer);
    this.fireTimer = null;
    this.started = false;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getVersion = () => this.version;

  private bump(immediate = false) {
    this.version++;
    if (immediate) this.fire();
    else if (!this.fireTimer) {
      this.fireTimer = setTimeout(() => { this.fireTimer = null; this.fire(); }, 400);
    }
  }
  private fire() { this.listeners.forEach((l) => l()); }

  private tick() {
    const nowReal = performance.now();
    const dt = Math.min(1000, nowReal - this.lastReal);
    this.lastReal = nowReal;
    this.carry += dt * this.S.speed;
    let steps = 0;
    while (this.carry >= 1000 && steps < 120) { this.step(); this.carry -= 1000; steps++; }
    if (this.carry > 5000) this.carry = 0;
    this.realSeconds += dt;
    if (this.realSeconds >= 1000) {
      this.realSeconds = 0;
      void this.flush();
      if (++this.flushCount % 60 === 0) this.prune();
    }
    this.bump();
  }

  /** Test / replay helper: advance the simulated clock without real time. */
  advance(ms: number) {
    for (let i = 0; i < Math.floor(ms / 1000); i++) this.step();
    this.flushLocalSync();
    this.bump(true);
  }

  // ───────────────────────── observation plumbing ─────────────────────────

  private mk(subjectId: string, metric: Metric, value: number | string | null, t: number, deviceId: string,
    quality: Quality, origin: Origin, meta?: Record<string, MetaValue>, correctionOf?: string): Obs {
    const o: Obs = {
      id: `O${(++this.S.seq).toString(36)}`, subjectId, metric, value, units: UNITS[metric],
      measuredAt: t, deviceId, quality, origin,
    };
    if (meta) o.meta = meta;
    if (correctionOf) o.correctionOf = correctionOf;
    if (PHYSICAL.has(metric) && astro(subjectId)) o.ctx = this.ctxFor(subjectId, t, origin);
    return o;
  }

  /** Context for a new reading: the astronaut's own entries win; the simulator's schedule fills the rest (simulated readings only). */
  private ctxFor(aid: string, t: number, origin: Origin): StoredContext {
    return mergeContext(this.S.contexts[aid], origin === 'simulated' ? this.gen.contextAt(aid, t) : null);
  }

  private addObs(o: Obs) {
    const k = sk(o.subjectId, o.metric);
    let arr = this.S.series.get(k);
    if (!arr) { arr = []; this.S.series.set(k, arr); }
    let i = arr.length;
    while (i > 0 && arr[i - 1].measuredAt > o.measuredAt) i--;
    arr.splice(i, 0, o);
    this.S.byId.set(o.id, o);
    if (o.correctionOf) this.S.superseded.add(o.correctionOf);
    const dev = this.S.devices[o.deviceId];
    if (dev && isValid(o)) dev.lastValidAt = Math.max(dev.lastValidAt ?? 0, o.measuredAt);
    this.dirty.observations.set(o.id, o);
    this.commit({ id: o.id, kind: 'obs', subjectId: o.subjectId, at: o.measuredAt, obs: o });
  }

  private commit(rec: Rec) {
    if (this.seeding) {
      this.ingestEarth(rec, Math.min(rec.at + this.S.comms.delayMs, this.S.T0));
      return;
    }
    if (this.persist) { this.unsaved.push(rec); this.S.unsavedCount = this.unsaved.length; }
    else this.enqueue(rec);
  }

  private enqueue(rec: Rec) {
    const item: OutboxItem = { rec, enqueuedAt: this.S.now, attempts: 0 };
    this.S.outbox.push(item);
    this.dirty.outbox.set(rec.id, item);
  }

  private linkUp() { return this.S.comms.enabled && this.S.online; }

  private ingestEarth(rec: Rec, receivedAt: number): boolean {
    const S = this.S;
    if (S.earth.has(rec.id)) return false;
    const er: EarthRec = { rec, receivedAt };
    S.earth.set(rec.id, er);
    this.dirty.earth.set(rec.id, er);
    if (!this.seeding) S.lastSyncAt = receivedAt;
    if (rec.obs) {
      const o = rec.obs;
      const k = sk(o.subjectId, o.metric);
      let arr = S.earthSeries.get(k);
      if (!arr) { arr = []; S.earthSeries.set(k, arr); }
      let i = arr.length;
      while (i > 0 && arr[i - 1].measuredAt > o.measuredAt) i--;
      arr.splice(i, 0, o);
      if (o.correctionOf) S.earthSuperseded.add(o.correctionOf);
    } else if (rec.alert) {
      const cur = S.earthAlerts.get(rec.alert.id);
      if (!cur || cur.alert.version < rec.alert.version) S.earthAlerts.set(rec.alert.id, { alert: rec.alert, receivedAt });
      if (!S.earthReview[rec.alert.id]) S.earthReview[rec.alert.id] = { status: 'received', updatedAt: receivedAt };
    } else if (rec.dev) {
      const cur = S.earthDevMsgs.get(rec.dev.id);
      if (!cur || cur.msg.version < rec.dev.version) S.earthDevMsgs.set(rec.dev.id, { msg: rec.dev, receivedAt });
    }
    return true;
  }

  private emitAlert(a: Alert) {
    this.S.alerts.set(a.id, a);
    this.dirty.alerts.set(a.id, a);
    const snap: Alert = { ...a, lines: [...a.lines], evidence: [...a.evidence] };
    this.commit({ id: `${a.id}.v${a.version}`, kind: 'alert', subjectId: a.subjectId, at: a.updatedAt, alert: snap });
  }

  private emitDevMsg(m: DeviceMsg) {
    this.S.deviceMsgs.set(m.id, m);
    this.dirty.deviceMsgs.set(m.id, m);
    this.commit({ id: `${m.id}.v${m.version}`, kind: 'device', subjectId: m.subjectId, at: m.updatedAt, dev: { ...m } });
  }

  // ───────────────────────── persistence (save locally BEFORE queueing) ─────────────────────────

  private flushLocalSync() {
    // Without a storage backend (tests), "saved" is immediate.
    if (this.persist) return;
    const u = this.unsaved; this.unsaved = [];
    u.forEach((r) => this.enqueue(r));
  }

  private metaSnapshot(): Record<string, unknown> {
    const S = this.S;
    return {
      schema: SCHEMA, now: S.now, T0: S.T0, speed: S.speed, scenarioId: S.scenarioId, devices: S.devices,
      cuff: S.cuff, due: S.due, seq: S.seq, viewerId: S.viewerId, lastMeasure: S.lastMeasure, measureLog: S.measureLog, contexts: S.contexts, bpCalibratedAt: S.bpCalibratedAt, mcRole: S.mcRole, comms: S.comms,
      injectCuffFail: S.injectCuffFail, lastSyncAt: S.lastSyncAt, lastAckAt: S.lastAckAt, dupRejected: S.dupRejected,
      downlink: S.downlink, eventsDone: S.eventsDone, activeKeys: S.activeKeys, earthReview: S.earthReview,
    };
  }

  async flush(): Promise<void> {
    if (!this.persist || this.flushing || !this.S.ready) return;
    this.flushing = true;
    const saving = this.dirty;
    this.dirty = newDirty();
    const toQueue = this.unsaved;
    this.unsaved = [];
    const batch: Batch = {
      put: {
        observations: [...saving.observations.values()], alerts: [...saving.alerts.values()],
        deviceMsgs: [...saving.deviceMsgs.values()], outbox: [...saving.outbox.values()], earth: [...saving.earth.values()],
      },
      del: { observations: [...saving.delObs], outbox: [...saving.delOutbox], earth: [...saving.delEarth] },
      meta: this.metaSnapshot(),
    };
    try {
      if (this.clearPending) { await this.clearPending; this.clearPending = null; }
      await this.persist.save(batch);
      this.S.storageError = null;
      toQueue.forEach((r) => this.enqueue(r)); // only now do records enter the transmit queue
    } catch (e) {
      this.S.storageError = `Local storage failed: ${e instanceof Error ? e.message : String(e)}. Records are held in memory and are not queued for Earth until they are saved.`;
      saving.observations.forEach((v, k) => { if (!this.dirty.observations.has(k)) this.dirty.observations.set(k, v); });
      saving.alerts.forEach((v, k) => { if (!this.dirty.alerts.has(k)) this.dirty.alerts.set(k, v); });
      saving.deviceMsgs.forEach((v, k) => { if (!this.dirty.deviceMsgs.has(k)) this.dirty.deviceMsgs.set(k, v); });
      saving.outbox.forEach((v, k) => { if (!this.dirty.outbox.has(k)) this.dirty.outbox.set(k, v); });
      saving.earth.forEach((v, k) => { if (!this.dirty.earth.has(k)) this.dirty.earth.set(k, v); });
      saving.delObs.forEach((k) => this.dirty.delObs.add(k));
      saving.delOutbox.forEach((k) => this.dirty.delOutbox.add(k));
      saving.delEarth.forEach((k) => this.dirty.delEarth.add(k));
      this.unsaved = [...toQueue, ...this.unsaved];
    } finally {
      this.S.unsavedCount = this.unsaved.length;
      this.flushing = false;
    }
  }

  private restore(l: Loaded) {
    const m = l.meta as Record<string, unknown>;
    const S = this.S = this.blankState();
    Object.assign(S, {
      now: m.now, T0: m.T0, speed: m.speed, scenarioId: m.scenarioId, devices: m.devices, cuff: m.cuff, due: m.due,
      seq: m.seq, viewerId: m.viewerId, lastMeasure: m.lastMeasure ?? {}, measureLog: m.measureLog ?? {}, contexts: m.contexts ?? {}, bpCalibratedAt: m.bpCalibratedAt ?? {}, mcRole: m.mcRole, comms: m.comms, injectCuffFail: m.injectCuffFail,
      lastSyncAt: m.lastSyncAt, lastAckAt: m.lastAckAt, dupRejected: m.dupRejected, downlink: m.downlink,
      eventsDone: m.eventsDone, activeKeys: m.activeKeys, earthReview: m.earthReview,
    });
    this.gen = new Gen(S.T0, scenarioById(S.scenarioId).mods);
    if (!m.bpCalibratedAt) this.seedCalibration(); // data saved before cuff calibration existed
    for (const o of [...l.observations].sort((a, b) => a.measuredAt - b.measuredAt)) {
      const k = sk(o.subjectId, o.metric);
      const arr = S.series.get(k) ?? [];
      arr.push(o);
      S.series.set(k, arr);
      S.byId.set(o.id, o);
      if (o.correctionOf) S.superseded.add(o.correctionOf);
    }
    l.alerts.forEach((a) => S.alerts.set(a.id, a));
    l.deviceMsgs.forEach((d) => S.deviceMsgs.set(d.id, d));
    // Retry state is not trusted across a reload: unacknowledged items are simply sent again
    // with the same IDs and Earth rejects the duplicates.
    S.outbox = l.outbox
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt)
      .map((i) => ({ rec: i.rec, enqueuedAt: i.enqueuedAt, attempts: i.attempts }));
    for (const e of [...l.earth].sort((a, b) => a.rec.at - b.rec.at)) {
      S.earth.set(e.rec.id, e);
      const r = e.rec;
      if (r.obs) {
        const k = sk(r.obs.subjectId, r.obs.metric);
        const arr = S.earthSeries.get(k) ?? [];
        arr.push(r.obs);
        S.earthSeries.set(k, arr);
        if (r.obs.correctionOf) S.earthSuperseded.add(r.obs.correctionOf);
      } else if (r.alert) {
        const cur = S.earthAlerts.get(r.alert.id);
        if (!cur || cur.alert.version < r.alert.version) S.earthAlerts.set(r.alert.id, { alert: r.alert, receivedAt: e.receivedAt });
      } else if (r.dev) {
        const cur = S.earthDevMsgs.get(r.dev.id);
        if (!cur || cur.msg.version < r.dev.version) S.earthDevMsgs.set(r.dev.id, { msg: r.dev, receivedAt: e.receivedAt });
      }
    }
    // Reconcile: a record saved locally just before the app closed may not have reached the persisted
    // outbox. Re-queue recent saved records that Earth does not have and the outbox does not hold.
    const queued = new Set(S.outbox.map((i) => i.rec.id));
    const recent = S.now - 10 * 60_000;
    const requeue = (rec: Rec) => { if (rec.at >= recent && !S.earth.has(rec.id) && !queued.has(rec.id)) { queued.add(rec.id); this.enqueue(rec); } };
    for (const o of S.byId.values()) requeue({ id: o.id, kind: 'obs', subjectId: o.subjectId, at: o.measuredAt, obs: o });
    S.alerts.forEach((a) => requeue({ id: `${a.id}.v${a.version}`, kind: 'alert', subjectId: a.subjectId, at: a.updatedAt, alert: { ...a } }));
    S.deviceMsgs.forEach((m) => requeue({ id: `${m.id}.v${m.version}`, kind: 'device', subjectId: m.subjectId, at: m.updatedAt, dev: { ...m } }));
    S.outbox.sort((a, b) => a.rec.at - b.rec.at);
    S.online = this.onlineFn();
    this.wasUp = this.linkUp();
    S.linkUp = this.wasUp;
  }

  // ───────────────────────── scenario seeding ─────────────────────────

  /** Rebuild the whole demonstration for a scenario: preloaded history, devices, live events. No typing. */
  loadScenario(id: string, viewer?: string) {
    const sc = scenarioById(id);
    const keep = { viewerId: viewer ?? this.S.viewerId, mcRole: this.S.mcRole, speed: this.S.speed, ready: this.S.ready, storageError: this.S.storageError };
    this.S = this.blankState();
    Object.assign(this.S, keep, { scenarioId: sc.id, online: this.onlineFn() });
    const S = this.S;
    this.dirty = newDirty();
    this.unsaved = [];
    this.carry = 0;
    this.gen = new Gen(T_START, sc.mods);
    this.clearPending = this.persist ? this.persist.clear() : null;

    for (const [devId, init] of Object.entries(sc.deviceInit ?? {})) {
      if (init.battery !== undefined) S.devices[devId].battery = init.battery;
    }
    for (const [mid, min] of Object.entries(sc.mods.cabinOfflineFromMin ?? {})) {
      const d = S.devices[moduleOf(mid)!.sensorId];
      d.state = 'disconnected';
      d.since = S.T0 + min * 60_000;
    }
    ASTRONAUTS.forEach((a) => {
      S.cuff[a.id] = {
        phase: 'idle', origin: null, startedAt: null, endedAt: null, cycleId: null, message: 'Ready',
        nextScheduled: S.T0 + (SIM.cuff.firstOffsetsMs[a.id] ?? 60_000),
      };
    });
    this.seedCalibration();
    this.seeding = true;
    this.seedHistory();
    S.due = {
      hr: S.T0 + SIM.intervals.heartRateMs, min: S.T0 + SIM.intervals.skinTempMs,
      cabin: S.T0 + SIM.intervals.cabinMs, rules: S.T0, bat: S.T0 + 60_000,
    };
    ASTRONAUTS.forEach((a) => {
      S.due[`sleep:${a.id}`] = this.gen.nextSleepEnd(a.id, S.T0).end;
      let c = Math.floor(S.T0 / DAY) * DAY + 9 * H;
      if (c <= S.T0) c += DAY;
      S.due[`checkin:${a.id}`] = c;
    });
    this.runRules();
    this.checkDevices();
    // Sleep alerts are derived from the last summaries.
    ASTRONAUTS.forEach((a) => this.sleepRule(a.id));
    this.seeding = false;
    S.lastSyncAt = S.T0;
    this.wasUp = this.linkUp();
    S.linkUp = this.wasUp;
    this.bump(true);
  }

  private produceBand(aid: string, t: number, ok: boolean): Obs[] {
    const dev = `BAND-${aid}`;
    if (!ok) {
      return [
        this.mk(aid, 'heart_rate', null, t, dev, 'missing', 'simulated', { reason: 'device not reporting' }),
        this.mk(aid, 'activity', 'unknown', t, dev, 'missing', 'simulated', { reason: 'device not reporting' }),
      ];
    }
    const busy = this.cuffBusy(aid);
    const meta = busy ? { note: 'cuff cycle in progress on the same arm; wrist reading may be disturbed' } : undefined;
    return [
      this.mk(aid, 'heart_rate', this.biased(aid, 'hr', this.gen.hr(aid, t)), t, dev, busy ? 'poor' : 'good', 'simulated', meta),
      this.mk(aid, 'activity', this.gen.activity(aid, t), t, dev, 'good', 'simulated'),
    ];
  }

  private produceSlow(aid: string, t: number, bandOk: boolean, bandState: DeviceState, cgmOk: boolean): Obs[] {
    const out: Obs[] = [];
    out.push(bandOk
      ? this.mk(aid, 'skin_temp', this.biased(aid, 'temp', this.gen.skinTemp(aid, t)), t, `BAND-${aid}`, 'good', 'simulated')
      : this.mk(aid, 'skin_temp', null, t, `BAND-${aid}`, 'missing', 'simulated', { reason: bandState === 'poor-contact' ? 'poor skin contact' : 'device not reporting' }));
    out.push(cgmOk
      ? this.mk(aid, 'glucose', this.biased(aid, 'glucose', this.gen.glucose(aid, t)), t, `CGM-${aid}`, 'good', 'simulated')
      : this.mk(aid, 'glucose', null, t, `CGM-${aid}`, 'missing', 'simulated', { reason: 'sensor not reporting' }));
    return out;
  }

  private produceCabin(mid: string, t: number, ok: boolean): Obs[] {
    const dev = moduleOf(mid)!.sensorId;
    if (!ok) {
      return (['co2', 'cabin_temp', 'cabin_rh'] as Metric[]).map((m) =>
        this.mk(mid, m, null, t, dev, 'missing', 'simulated', { reason: 'module reading unavailable' }));
    }
    return [
      this.mk(mid, 'co2', this.gen.co2(mid, t), t, dev, 'good', 'simulated'),
      this.mk(mid, 'cabin_temp', this.gen.cabinTemp(mid, t), t, dev, 'good', 'simulated'),
      this.mk(mid, 'cabin_rh', this.gen.cabinRh(mid, t), t, dev, 'good', 'simulated'),
    ];
  }

  private seedHistory() {
    const S = this.S;
    const g = this.gen;
    const T0 = S.T0;
    const out: Obs[] = [];
    const start = T0 - SIM.history.days * DAY;
    const fullFrom = T0 - SIM.history.fullResSinceMs;
    const sample = (t: number) => {
      for (const a of ASTRONAUTS) {
        out.push(...this.produceBand(a.id, t, true), ...this.produceSlow(a.id, t, true, 'ok', true));
      }
      for (const m of MODULES) {
        const off = g.cabinOfflineFrom(m.id);
        out.push(...this.produceCabin(m.id, t, !(off !== undefined && t >= off)));
      }
    };
    const step = SIM.history.coarseStepMs;
    for (let t = Math.ceil(start / step) * step; t < fullFrom; t += step) sample(t);
    for (let t = Math.ceil(fullFrom / 60_000) * 60_000; t <= T0; t += 60_000) sample(t);

    ASTRONAUTS.forEach((a, idx) => {
      for (let d = Math.floor(start / DAY); d <= Math.floor(T0 / DAY); d++) {
        for (const hh of [8, 14, 20]) {
          const t = d * DAY + (hh + idx * 0.25) * H;
          if (t > start && t < T0 - 30 * 60_000) out.push(...this.bpObs(a.id, t, 'HIST', 'scheduled'));
        }
        const c = d * DAY + 9 * H;
        if (c > start && c <= T0) {
          const ch = g.checkin(a.id, c, g.sleepSession(a.id, d - 1).hours);
          out.push(...this.checkinObs(a.id, c, ch, 'simulated-self-report'));
        }
      }
      out.push(...this.bpObs(a.id, T0 - (6 + 2 * idx) * 60_000, 'HIST-RECENT', 'scheduled')); // recent result
      const kLatest = Math.floor(T0 / DAY) - 1;
      for (let k = kLatest - 3; k <= kLatest; k++) {
        const s = g.sleepSession(a.id, k);
        if (s.end <= T0) {
          out.push(this.mk(a.id, 'sleep', Math.round(s.hours * 10) / 10, s.end, `BAND-${a.id}`, 'good', 'simulated', { start: s.start, end: s.end }));
        }
      }
    });
    out.sort((a, b) => a.measuredAt - b.measuredAt);
    out.forEach((o) => this.addObs(o));
    S.now = T0;
  }

  private bpObs(aid: string, t: number, cycleId: string, how: string): Obs[] {
    const g = this.gen.bp(aid, t);
    const v = { sys: this.biased(aid, 'sys', g.sys), dia: this.biased(aid, 'dia', g.dia) };
    const meta = { cycleId, cycle: how };
    return [
      this.mk(aid, 'bp_systolic', v.sys, t, `CUFF-${aid}`, 'good', 'simulated', meta),
      this.mk(aid, 'bp_diastolic', v.dia, t, `CUFF-${aid}`, 'good', 'simulated', meta),
    ];
  }

  private checkinObs(aid: string, t: number, c: { mood: number; stress: number; fatigue: number }, origin: Origin): Obs[] {
    const dev = origin === 'manual' ? 'MANUAL' : 'SIM-SELF-REPORT';
    const meta = origin === 'simulated-self-report' ? { simulatedSelfReport: true } : undefined;
    return (['mood', 'stress', 'fatigue'] as const).map((m) => this.mk(aid, m, c[m], t, dev, 'good', origin, meta));
  }

  // ───────────────────────── the clock ─────────────────────────

  private step() {
    const S = this.S;
    S.now += 1000;
    const t = S.now;
    const d = S.due;

    if (t >= d.hr) {
      d.hr += SIM.intervals.heartRateMs;
      for (const a of ASTRONAUTS) if (!this.replaying(a.id)) this.produceBand(a.id, t, S.devices[`BAND-${a.id}`].state === 'ok').forEach((o) => this.addObs(o));
    }
    if (t >= d.min) {
      d.min += SIM.intervals.skinTempMs;
      for (const a of ASTRONAUTS) {
        if (this.replaying(a.id)) continue;
        const band = S.devices[`BAND-${a.id}`];
        this.produceSlow(a.id, t, band.state === 'ok', band.state, S.devices[`CGM-${a.id}`].state === 'ok').forEach((o) => this.addObs(o));
      }
    }
    if (t >= d.cabin) {
      d.cabin += SIM.intervals.cabinMs;
      for (const m of MODULES) this.produceCabin(m.id, t, S.devices[m.sensorId].state === 'ok').forEach((o) => this.addObs(o));
    }
    for (const a of ASTRONAUTS) {
      if (t >= d[`sleep:${a.id}`]) {
        const endDue = d[`sleep:${a.id}`];
        const s = this.gen.nextSleepEnd(a.id, endDue - 1);
        d[`sleep:${a.id}`] = this.gen.nextSleepEnd(a.id, s.end).end;
        if (S.devices[`BAND-${a.id}`].state === 'ok') {
          this.addObs(this.mk(a.id, 'sleep', Math.round(s.hours * 10) / 10, s.end, `BAND-${a.id}`, 'good', 'simulated', { start: s.start, end: s.end }));
        } else {
          this.addObs(this.mk(a.id, 'sleep', null, s.end, `BAND-${a.id}`, 'missing', 'simulated', { reason: 'estimate unavailable' }));
        }
        this.sleepRule(a.id);
      }
      if (t >= d[`checkin:${a.id}`]) {
        d[`checkin:${a.id}`] += DAY;
        const sl = lastValid(S.series, S.superseded, a.id, 'sleep');
        this.checkinObs(a.id, t, this.gen.checkin(a.id, t, sl ? Number(sl.value) : 7), 'simulated-self-report').forEach((o) => this.addObs(o));
      }
      if (!this.replaying(a.id)) this.cuffStep(a.id);
    }
    this.replayStep();
    if (t >= d.bat) { d.bat += 60_000; this.batteryStep(); }
    for (const ev of scenarioById(S.scenarioId).events) {
      if (!S.eventsDone.includes(ev.id) && t >= S.T0 + ev.atSec * 1000) { S.eventsDone.push(ev.id); ev.run(this); }
    }
    if (t >= d.rules) { d.rules = t + 5000; this.runRules(); this.checkDevices(); }
    this.commsStep();
  }

  // ───────────────────────── Earth link: store and forward ─────────────────────────

  private commsStep() {
    const S = this.S;
    const up = this.linkUp();
    if (this.wasUp && !up) {
      // Link lost: anything not yet acknowledged goes back to "waiting". If Earth already got it,
      // the retry will be recognised and rejected as a duplicate.
      for (const it of S.outbox) {
        if (it.sentAt !== undefined) { it.sentAt = it.deliverAt = it.ackAt = undefined; it.attemptDelivered = false; }
      }
    }
    this.wasUp = up;
    S.linkUp = up;
    if (!up) return;

    const keep: OutboxItem[] = [];
    for (const it of S.outbox) {
      if (it.sentAt !== undefined) {
        if (!it.attemptDelivered && it.deliverAt! <= S.now) {
          if (!this.ingestEarth(it.rec, it.deliverAt!)) S.dupRejected++;
          S.lastSyncAt = it.deliverAt!;
          it.attemptDelivered = true;
        }
        if (it.attemptDelivered && it.ackAt! <= S.now) {
          S.lastAckAt = S.now;
          this.dirty.outbox.delete(it.rec.id);
          this.dirty.delOutbox.add(it.rec.id);
          continue;
        }
      }
      keep.push(it);
    }
    S.outbox = keep;

    let sent = 0;
    const send = (it: OutboxItem) => {
      it.sentAt = S.now; it.attempts++; it.attemptDelivered = false;
      it.deliverAt = S.now + S.comms.delayMs; it.ackAt = it.deliverAt + S.comms.delayMs;
      sent++;
    };
    for (const it of S.outbox) if (sent < 100 && it.sentAt === undefined && it.rec.kind !== 'obs') send(it);
    for (const it of S.outbox) if (sent < 100 && it.sentAt === undefined) send(it);

    const arrived = S.downlink.filter((x) => x.arriveAt <= S.now);
    if (arrived.length) {
      S.downlink = S.downlink.filter((x) => x.arriveAt > S.now);
      for (const x of arrived) {
        const a = S.alerts.get(x.alertId);
        if (a) { a.groundReply = { text: x.text, at: S.now }; a.version++; a.updatedAt = S.now; this.emitAlert(a); }
      }
    }
  }

  setCommsEnabled(enabled: boolean) { this.S.comms.enabled = enabled; this.bump(true); }
  setDelay(ms: number) { this.S.comms.delayMs = ms; this.bump(true); }

  // ───────────────────────── devices ─────────────────────────

  setDevice(id: string, state: DeviceState) {
    const d = this.S.devices[id];
    if (!d || d.state === state) return;
    d.state = state;
    d.since = this.S.now;
    this.bump(true);
  }
  setBattery(id: string, pct: number) {
    const d = this.S.devices[id];
    if (d) { d.battery = pct; this.bump(true); }
  }

  private batteryStep() {
    for (const d of Object.values(this.S.devices)) {
      if (d.kind === 'band' && d.battery !== null && d.state === 'ok') {
        d.battery = Math.max(0, Math.round((d.battery - 0.04) * 100) / 100);
        if (d.battery <= 0) { d.state = 'disconnected'; d.since = this.S.now; }
      }
    }
  }

  private activeDevMsg(deviceId: string, kind: DeviceMsg['kind']): DeviceMsg | undefined {
    for (const m of this.S.deviceMsgs.values()) if (m.active && m.deviceId === deviceId && m.kind === kind) return m;
    return undefined;
  }

  private raiseDevMsg(dev: Device, kind: DeviceMsg['kind'], text: string, subjectId = dev.ownerId) {
    if (this.activeDevMsg(dev.id, kind)) return;
    const now = this.S.now;
    this.emitDevMsg({ id: `DM${++this.S.seq}`, version: 1, deviceId: dev.id, subjectId, kind, text, createdAt: now, updatedAt: now, active: true });
  }
  private resolveDevMsg(deviceId: string, kind: DeviceMsg['kind']) {
    const m = this.activeDevMsg(deviceId, kind);
    if (!m) return;
    m.active = false; m.version++; m.updatedAt = this.S.now;
    this.emitDevMsg(m);
  }

  /** Device failures get their own status message, separate from health prompts. */
  private checkDevices() {
    const S = this.S;
    for (const dev of Object.values(S.devices)) {
      const last = dev.lastValidAt ? `last valid data ${fmtTime(dev.lastValidAt)} (${fmtAge(S.now - dev.lastValidAt)} ago)` : 'no valid data yet';
      if (dev.state === 'disconnected' && S.now - dev.since >= SIM.thresholds.deviceMissingMs) {
        this.raiseDevMsg(dev, 'disconnected', `${dev.id} is disconnected (${last}). Values show as unavailable; last valid values keep their original timestamps. Help requests still work.`);
      } else if (dev.state === 'poor-contact' && S.now - dev.since >= SIM.thresholds.deviceMissingMs) {
        this.raiseDevMsg(dev, 'poor-contact', `${dev.id} reports poor skin contact (${last}).`);
      } else if (dev.state === 'ok') {
        this.resolveDevMsg(dev.id, 'disconnected');
        this.resolveDevMsg(dev.id, 'poor-contact');
      }
      if (dev.battery !== null) {
        if (dev.battery < SIM.thresholds.batteryLowPct) this.raiseDevMsg(dev, 'low-battery', `${dev.id} battery is ${Math.round(dev.battery)}% (simulation parameter: low below ${SIM.thresholds.batteryLowPct}%).`);
        else if (dev.battery > SIM.thresholds.batteryLowPct + 5) this.resolveDevMsg(dev.id, 'low-battery');
      }
    }
  }

  // ───────────────────────── cuff workflow ─────────────────────────

  cuffBusy(aid: string) {
    const c = this.S.cuff[aid];
    return !!c && (c.phase === 'inflating' || c.phase === 'measuring' || c.phase === 'deflating');
  }

  startCuff(aid: string, origin: 'scheduled' | 'manual'): boolean {
    const S = this.S;
    const c = S.cuff[aid];
    const dev = S.devices[`CUFF-${aid}`];
    if (!c || this.cuffBusy(aid)) return false;
    c.origin = origin; c.startedAt = S.now; c.endedAt = null; c.cycleId = `CY${++S.seq}`;
    if (dev.state !== 'ok') { this.failCuff(aid, 'Cuff is not connected.'); return true; }
    if ((dev.battery ?? 100) <= 2) { this.failCuff(aid, 'Cuff battery is depleted.'); return true; }
    dev.battery = Math.max(0, Math.round(((dev.battery ?? 100) - SIM.cuff.batteryPerCycle) * 10) / 10);
    c.phase = 'inflating';
    c.message = origin === 'manual' ? 'Measuring now (requested)…' : 'Scheduled measurement…';
    if (origin === 'manual') this.bump(true);
    return true;
  }

  cancelCuff(aid: string) {
    const c = this.S.cuff[aid];
    if (!c || !this.cuffBusy(aid)) return;
    c.phase = 'cancelled'; c.endedAt = this.S.now; c.message = 'Cancelled. Cuff deflated; no reading recorded.';
    this.bump(true);
  }

  private failCuff(aid: string, reason: string) {
    const S = this.S;
    const c = S.cuff[aid];
    const meta = { cycleId: c.cycleId, failure: reason };
    this.addObs(this.mk(aid, 'bp_systolic', null, S.now, `CUFF-${aid}`, 'missing', 'simulated', meta));
    this.addObs(this.mk(aid, 'bp_diastolic', null, S.now, `CUFF-${aid}`, 'missing', 'simulated', meta));
    c.phase = 'failed'; c.endedAt = S.now; c.message = `Failed: ${reason} Automatic deflation. The previous valid result is kept.`;
    const dev = S.devices[`CUFF-${aid}`];
    this.raiseDevMsg(dev, 'cuff-failed', `${dev.id}: measurement cycle failed at ${fmtTime(S.now)} — ${reason}`);
  }

  private cuffStep(aid: string) {
    const S = this.S;
    const c = S.cuff[aid];
    if (this.cuffBusy(aid)) {
      const f = (S.now - c.startedAt!) / SIM.cuff.durationMs;
      if (S.injectCuffFail && f >= 0.7) { S.injectCuffFail = false; this.failCuff(aid, 'Pressure/time limit reached (simulated fault).'); return; }
      if (f >= 1) { this.completeCuff(aid); return; }
      c.phase = f < 0.6 ? 'inflating' : f < 0.85 ? 'measuring' : 'deflating';
      return;
    }
    if (S.now >= c.nextScheduled) {
      c.nextScheduled += SIM.cuff.scheduleEveryMs;
      if (!this.gen.asleep(aid, S.now)) this.startCuff(aid, 'scheduled');
    }
  }

  private completeCuff(aid: string) {
    const S = this.S;
    const c = S.cuff[aid];
    const v = this.gen.bp(aid, S.now);
    const meta = { cycleId: c.cycleId, cycle: c.origin };
    const sys = this.mk(aid, 'bp_systolic', v.sys, S.now, `CUFF-${aid}`, 'good', 'simulated', meta);
    const dia = this.mk(aid, 'bp_diastolic', v.dia, S.now, `CUFF-${aid}`, 'good', 'simulated', meta);
    this.addObs(sys); this.addObs(dia);
    c.phase = 'completed'; c.endedAt = S.now; c.message = `Completed: ${v.sys}/${v.dia} mmHg at ${fmtTime(S.now)}`;
    this.resolveDevMsg(`CUFF-${aid}`, 'cuff-failed');
    this.bpRule(aid, sys, dia);
  }

  /** On-demand measurement: every sensor is read now. Works with whatever is connected; missing sensors give explicit "missing" records. */
  measureNow(aid: string) {
    const S = this.S;
    const t = S.now;
    const a = astro(aid);
    if (!a) return;
    if (this.replaying(aid)) { this.replayMeasure(aid); return; }
    if (S.demoBias === 'mix') S.runPlan[aid] = this.planFor('mix'); // a new random mix for every run
    const band = S.devices[`BAND-${aid}`], cgm = S.devices[`CGM-${aid}`], cuff = S.devices[`CUFF-${aid}`];
    const cab = S.devices[moduleOf(a.moduleId)!.sensorId];
    const cycleId = `OD${++S.seq}`;
    const demo = S.demoBias !== 'normal'; // test values never count toward a personal baseline
    const tag = (o: Obs): Obs => { o.meta = { ...o.meta, session: cycleId, ...(demo ? { demo: true } : {}) }; return o; }; // a "session" is one Measure vitals tap
    this.produceBand(aid, t, band.state === 'ok').forEach((o) => this.addObs(tag(o)));
    this.produceSlow(aid, t, band.state === 'ok', band.state, cgm.state === 'ok').forEach((o) => this.addObs(tag(o)));
    this.produceCabin(a.moduleId, t, cab.state === 'ok').forEach((o) => this.addObs(o));
    if (cuff.state === 'ok' && (cuff.battery ?? 100) > 2) {
      cuff.battery = Math.max(0, Math.round(((cuff.battery ?? 100) - SIM.cuff.batteryPerCycle) * 10) / 10);
      const [sys, dia] = this.bpObs(aid, t, cycleId, 'on-demand');
      this.addObs(tag(sys)); this.addObs(tag(dia));
      this.resolveDevMsg(cuff.id, 'cuff-failed');
      this.bpRule(aid, sys, dia);
    } else {
      const reason = cuff.state !== 'ok' ? 'Cuff is not connected.' : 'Cuff battery is depleted.';
      const meta = { cycleId, failure: reason };
      this.addObs(tag(this.mk(aid, 'bp_systolic', null, t, cuff.id, 'missing', 'simulated', meta)));
      this.addObs(tag(this.mk(aid, 'bp_diastolic', null, t, cuff.id, 'missing', 'simulated', meta)));
      this.raiseDevMsg(cuff, 'cuff-failed', `${cuff.id}: on-demand measurement failed at ${fmtTime(t)} — ${reason}`);
    }
    if (S.demoBias !== 'normal') this.applyRunSleep(aid);
    S.lastMeasure[aid] = t;
    S.measureLog[aid] = [...(S.measureLog[aid] ?? []), t].slice(-20);
    this.bump(true);
  }

  setInjectCuffFail(v: boolean) { this.S.injectCuffFail = v; this.bump(true); }

  /**
   * Demo helper: add `n` simulated past sessions (one every 3 hours, going back from now) so a personal baseline can form.
   * No alerts, no battery use. Each session carries the simulator's schedule context for its time.
   */
  backfillSessions(aid: string, n = 7) {
    const S = this.S;
    if (!astro(aid)) return;
    for (let i = n; i >= 1; i--) {
      const t = S.now - i * 3 * H - 7 * 60_000;
      const cycleId = `BF${++S.seq}`;
      const tag = (o: Obs): Obs => { o.meta = { ...o.meta, session: cycleId, backfilled: true, ...(S.demoBias !== 'normal' ? { demo: true } : {}) }; return o; };
      this.produceBand(aid, t, true).forEach((o) => this.addObs(tag(o)));
      this.produceSlow(aid, t, true, 'ok', true).forEach((o) => this.addObs(tag(o)));
      this.bpObs(aid, t, cycleId, 'backfill').forEach((o) => this.addObs(tag(o)));
    }
    this.bump(true);
  }

  // ───────────────────────── replay of recorded data ─────────────────────────

  /** A simulated value, or the run's out-of-range target for this astronaut (plus the generator's own wobble). */
  private biased(aid: string, k: 'hr' | 'sys' | 'dia' | 'glucose' | 'temp', v: number): number {
    const target = this.S.runPlan[aid]?.[k];
    if (target === undefined) return v;
    if (k === 'temp') return Math.round((target + ((Math.round(v * 10) % 3) - 1) * 0.1) * 10) / 10;
    return Math.round(target + (v % 3) - 1);
  }

  /** Which vitals are out of range for one run, and where to. Values stay plausible. */
  private planFor(mode: DemoBias): RunPlan {
    const r = () => this.rand();
    const int = (lo: number, span: number) => lo + Math.floor(r() * span);
    const make = {
      hr: (up: boolean): RunPlan => ({ hr: up ? int(100, 13) : int(42, 4) }),
      bp: (up: boolean): RunPlan => (up ? { sys: int(145, 14), dia: int(92, 6) } : { sys: int(86, 4), dia: int(52, 4) }),
      glucose: (up: boolean): RunPlan => ({ glucose: up ? int(160, 26) : int(60, 6) }),
      temp: (): RunPlan => ({ temp: 35.6 + int(0, 4) / 10 }),
      sleep: (): RunPlan => ({ sleep: 4.2 + int(0, 14) / 10 }),
    };
    if (mode === 'normal') return {};
    if (mode === 'high') return { ...make.hr(true), ...make.bp(true), ...make.glucose(true), ...make.temp(), ...make.sleep() };
    if (mode === 'low') return { ...make.hr(false), ...make.bp(false), ...make.glucose(false), ...make.sleep() };
    // mix: 2 or 3 of the five, chosen at random, each high or low as it makes sense
    const names = ['hr', 'bp', 'glucose', 'temp', 'sleep'] as const;
    const order = [...names].sort(() => r() - 0.5).slice(0, r() < 0.5 ? 2 : 3);
    let plan: RunPlan = {};
    for (const n of order) {
      if (n === 'hr') plan = { ...plan, ...make.hr(r() < 0.7) };
      else if (n === 'bp') plan = { ...plan, ...make.bp(r() < 0.7) };
      else if (n === 'glucose') plan = { ...plan, ...make.glucose(r() < 0.65) };
      else if (n === 'temp') plan = { ...plan, ...make.temp() };
      else plan = { ...plan, ...make.sleep() };
    }
    return plan;
  }

  setDemoBias(b: DemoBias) {
    const S = this.S;
    S.demoBias = b;
    S.runPlan = {};
    if (b !== 'mix') for (const a of ASTRONAUTS) S.runPlan[a.id] = this.planFor(b); // a mix is rolled per run, in measureNow
    this.bump(true);
  }

  /** Last night's sleep for this run: low if the plan says so, otherwise the original estimate. The original reading is kept. */
  private applyRunSleep(aid: string) {
    const S = this.S;
    const latest = lastValid(S.series, S.superseded, aid, 'sleep');
    if (!latest) return;
    let root = latest;
    while (root.correctionOf && S.byId.get(root.correctionOf)) root = S.byId.get(root.correctionOf)!;
    const want = S.runPlan[aid]?.sleep ?? (typeof root.value === 'number' ? root.value : null);
    if (want === null || latest.value === want) return;
    const end = typeof root.meta?.end === 'number' ? root.meta.end : root.measuredAt;
    this.addObs(this.mk(aid, 'sleep', want, root.measuredAt, root.deviceId, 'good', 'simulated', { start: end - want * H, end, run: true }, latest.id));
  }

  private replayDs: ReplayDataset | null = null;

  private replaying(aid: string) { return this.S.replay.on && this.S.replay.subjectId === aid; }

  /** Start replaying a dataset as the signed-in astronaut's band, cuff and glucose patch. Same pipeline as live devices. */
  startReplay(ds: ReplayDataset) {
    const S = this.S;
    this.replayDs = ds;
    S.replay = { ...S.replay, on: true, playing: true, datasetId: ds.id, datasetTitle: ds.title, kind: ds.kind, posMs: 0, cycles: 0, ended: false, subjectId: S.viewerId };
    this.bump(false);
  }

  stopReplay() { this.replayDs = null; this.S.replay = { ...replayIdle(), speed: this.S.replay.speed, loop: this.S.replay.loop }; this.bump(true); }
  setReplayPlaying(v: boolean) { if (!this.S.replay.on) return; this.S.replay = { ...this.S.replay, playing: v, ended: v ? false : this.S.replay.ended }; this.bump(false); }
  setReplaySpeed(v: number) { this.S.replay = { ...this.S.replay, speed: v }; this.bump(false); }
  setReplayLoop(v: boolean) { this.S.replay = { ...this.S.replay, loop: v }; this.bump(false); }

  private replayStep() {
    const S = this.S, R = S.replay;
    if (!R.on || !R.playing || !this.replayDs || !R.subjectId) return;
    const adv = advance(this.replayDs, R.posMs, R.speed * 1000, R.loop);
    for (const f of adv.frames) this.ingestFrame(R.subjectId, f, this.replayDs.id, S.now - Math.min(999, Math.max(0, Math.round((adv.posMs - f.t) / R.speed))));
    S.replay = { ...R, posMs: adv.posMs, cycles: R.cycles + (adv.wrapped ? 1 : 0), ended: adv.ended, playing: adv.ended ? false : R.playing };
  }

  /** The astronaut taps Measure during replay: play on to the next recorded cuff reading. */
  private replayMeasure(aid: string) {
    const S = this.S;
    const ds = this.replayDs;
    if (ds) {
      const next = nextBpFrame(ds, S.replay.posMs);
      if (next) {
        const wrap = next.t <= S.replay.posMs;
        const adv = advance(ds, wrap ? -1 : S.replay.posMs, wrap ? next.t + 1 : next.t - S.replay.posMs, false);
        for (const f of adv.frames) this.ingestFrame(aid, f, ds.id);
        S.replay = { ...S.replay, posMs: next.t, cycles: S.replay.cycles + (wrap ? 1 : 0) };
      }
    }
    S.lastMeasure[aid] = S.now;
    S.measureLog[aid] = [...(S.measureLog[aid] ?? []), S.now].slice(-20);
    this.bump(true);
  }

  /** Turn a recorded frame into observations stamped with the current simulated time. Context and quality come from the frame. */
  private ingestFrame(aid: string, f: ReplayFrame, dsId: string, at?: number) {
    const S = this.S, t = at ?? S.now;
    const ago = (m: number | null) => (m === null ? null : t - m * 60_000);
    const stored: StoredContext = { posture: f.posture, exerciseAt: ago(f.exerciseMinAgo), mealAt: ago(f.mealMinAgo), sleepHours: f.sleepHours, notes: 'replayed recording' };
    const meta = { readingQuality: f.quality, dataset: dsId, replayT: f.t, session: `${dsId}:${f.seg ?? 'r'}:${Math.floor(f.t / 3_600_000)}`, ...(f.seg ? { seg: f.seg } : {}) };
    const add = (metric: Metric, value: number | string, dev: string, extra: Record<string, MetaValue> = {}) => {
      const o = this.mk(aid, metric, value, t, `REPLAY-${dev}`, 'good', 'replay', { ...meta, ...extra });
      o.ctx = stored;
      this.addObs(o);
    };
    if (f.hr !== undefined) add('heart_rate', f.hr, 'BAND');
    if (f.skinTemp !== undefined) add('skin_temp', f.skinTemp, 'BAND');
    if (f.activity) add('activity', f.activity, 'BAND');
    // a motion label belongs to the wrist and cuff readings, not to the glucose patch
    if (f.glucose !== undefined) add('glucose', f.glucose, 'CGM', { ...(f.mealCarbsG ? { mealCarbsG: f.mealCarbsG } : {}), readingQuality: f.quality === 'motion' ? 'good' : f.quality });
    if (f.sys !== undefined && f.dia !== undefined) { add('bp_systolic', f.sys, 'CUFF'); add('bp_diastolic', f.dia, 'CUFF'); }
    if (f.sleep) {
      const s = f.sleep;
      add('sleep', s.hours, 'BAND', { efficiencyPct: s.efficiencyPct, awakeMin: s.awakeMin, lightMin: s.lightMin, deepMin: s.deepMin, remMin: s.remMin, restingHr: s.restingHr });
    }
  }

  // ───────────────────────── context and calibration ─────────────────────────

  /** Record what the astronaut says about posture, last exercise, last meal or last night's sleep. Applies to new readings only. */
  setContext(aid: string, patch: Partial<ContextInput>) {
    this.S.contexts[aid] = { ...emptyInput(), ...this.S.contexts[aid], ...patch };
    this.bump(true);
  }

  /** The upper-arm cuff was calibrated against a reference measurement just now (simulated). */
  calibrateBp(aid: string) {
    this.S.bpCalibratedAt[aid] = this.S.now;
    this.bump(true);
  }

  private seedCalibration() {
    // Fictional spread so the display shows fresh, ageing and stale calibrations.
    const days: Record<string, number> = { A1: 12, A2: 24, A3: 33, A4: 5 };
    for (const a of ASTRONAUTS) this.S.bpCalibratedAt[a.id] = this.S.T0 - (days[a.id] ?? 10) * DAY;
  }

  // ───────────────────────── rules (demonstration rules, simulation parameters) ─────────────────────────

  private setAlert(key: string, spec: AlertSpec | null) {
    const S = this.S;
    const existingId = S.activeKeys[key];
    const existing = existingId ? S.alerts.get(existingId) : undefined;
    if (spec) {
      if (existing && existing.status === 'open') {
        if (existing.level !== spec.level) {
          existing.level = spec.level; existing.title = spec.title; existing.lines = spec.lines;
          existing.evidence = spec.evidence; existing.version++; existing.updatedAt = S.now;
          this.emitAlert(existing);
        }
        return;
      }
      const a = this.newAlert(spec);
      S.activeKeys[key] = a.id;
      this.emitAlert(a);
    } else if (existing) {
      delete S.activeKeys[key];
      if (existing.status === 'open') {
        existing.status = 'cleared'; existing.version++; existing.updatedAt = S.now;
        this.emitAlert(existing);
      }
    }
  }

  private newAlert(spec: AlertSpec): Alert {
    const now = this.S.now;
    return {
      id: `AL${++this.S.seq}`, version: 1, kind: spec.kind, subjectId: spec.subjectId, level: spec.level,
      title: spec.title, lines: spec.lines, evidence: spec.evidence, contextNote: spec.contextNote,
      procedure: PROCEDURE[spec.level], createdAt: now, updatedAt: now, status: 'open',
      onboardReview: 'none', simulated: spec.simulated ?? true,
    };
  }

  describe(o: Obs): string {
    return `${METRIC_LABEL[o.metric]} ${o.value === null ? 'unavailable' : `${o.value} ${o.units}`} at ${fmtTime(o.measuredAt)} (${o.origin}, quality ${o.quality}, ${o.deviceId})`;
  }

  private runRules() {
    const S = this.S;
    const T = SIM.thresholds;
    for (const a of ASTRONAUTS) {
      // Resting pulse: 12 consecutive good readings (about 1 minute) all while resting.
      const hr = seriesOf(S.series, a.id, 'heart_rate').slice(-12);
      const act = seriesOf(S.series, a.id, 'activity').slice(-12);
      let spec: AlertSpec | null = null;
      if (hr.length === 12 && act.length === 12 && hr.every((o) => o.quality === 'good' && o.value !== null) && act.every((o) => o.value === 'resting')) {
        const vals = hr.map((o) => Number(o.value));
        const lo = Math.min(...vals);
        if (lo >= T.restingPulseVerify) {
          const level: Level = lo >= T.restingPulseReview ? 'review' : 'verify';
          spec = {
            kind: 'vital', subjectId: a.id, level, title: 'Resting pulse above the simulation limit',
            lines: [
              `Pulse ${lo}–${Math.max(...vals)} bpm across 12 readings from ${fmtTime(hr[0].measuredAt)} to ${fmtTime(hr[11].measuredAt)} while activity was "resting" (quality good, ${hr[0].deviceId}).`,
              `Simulation parameter: resting pulse at or above ${T.restingPulseVerify} bpm → Verify; at or above ${T.restingPulseReview} bpm → Review suggested.`,
            ],
            evidence: [hr[0].id, hr[11].id],
          };
        }
      }
      this.setAlert(`hr:${a.id}`, spec);

      const g = lastValid(S.series, S.superseded, a.id, 'glucose', true);
      let gs: AlertSpec | null = null;
      if (g && S.now - g.measuredAt <= SIM.stale.glucose) {
        const v = Number(g.value);
        const level: Level | null = v <= T.glucoseReviewLow || v >= T.glucoseReviewHigh ? 'review' : v < T.glucoseLow || v > T.glucoseHigh ? 'verify' : null;
        if (level) {
          gs = {
            kind: 'vital', subjectId: a.id, level, title: 'Sensor glucose outside the simulation range',
            lines: [
              `${this.describe(g)}. This is interstitial (sensor) glucose.`,
              `Simulation parameter: below ${T.glucoseLow} or above ${T.glucoseHigh} mg/dL → Verify; at or below ${T.glucoseReviewLow} or at or above ${T.glucoseReviewHigh} mg/dL → Review suggested.`,
            ],
            evidence: [g.id],
          };
        }
      }
      this.setAlert(`glu:${a.id}`, gs);
    }
    for (const m of MODULES) {
      const c = lastValid(S.series, S.superseded, m.id, 'co2', true);
      let spec: AlertSpec | null = null;
      if (c && S.now - c.measuredAt <= SIM.stale.co2) {
        const v = Number(c.value);
        const level: Level | null = v >= T.co2Review ? 'review' : v >= T.co2Verify ? 'verify' : null;
        if (level) {
          spec = {
            kind: 'cabin', subjectId: m.id, level, title: `Cabin CO₂ above the simulation limit in ${m.name}`,
            lines: [
              `${this.describe(c)}, sensor ${m.sensorId}, location ${m.name}.`,
              `Residents of this module: ${residents(m.id).map((r) => r.name).join(', ')}.`,
              `Simulation parameter: CO₂ at or above ${T.co2Verify} ppm → Verify; at or above ${T.co2Review} ppm → Review suggested. Original unit (ppm) preserved; no averaging interval is defined in this prototype.`,
            ],
            evidence: [c.id],
          };
        }
      }
      this.setAlert(`co2:${m.id}`, spec);
    }
  }

  private bpRule(aid: string, sys: Obs, dia: Obs) {
    const T = SIM.thresholds;
    const s = Number(sys.value), d = Number(dia.value);
    const level: Level | null = s >= T.bpReviewSys || d >= T.bpReviewDia ? 'review' : s >= T.bpVerifySys || d >= T.bpVerifyDia ? 'verify' : null;
    this.setAlert(`bp:${aid}`, level ? {
      kind: 'vital', subjectId: aid, level, title: 'Cuff blood pressure above the simulation limit',
      lines: [
        `Cuff result ${s}/${d} mmHg measured at ${fmtTime(sys.measuredAt)} (${String(sys.meta?.cycle ?? 'cycle')} cycle ${String(sys.meta?.cycleId ?? '')}, quality ${sys.quality}, ${sys.deviceId}, ${sys.origin}).`,
        `Simulation parameter: at or above ${T.bpVerifySys}/${T.bpVerifyDia} mmHg → Verify; at or above ${T.bpReviewSys}/${T.bpReviewDia} mmHg → Review suggested. Repeat the measurement before acting.`,
      ],
      evidence: [sys.id, dia.id],
    } : null);
  }

  private sleepRule(aid: string) {
    const S = this.S;
    const arr = seriesOf(S.series, aid, 'sleep').filter((o) => isValid(o) && !S.superseded.has(o.id));
    const last = arr[arr.length - 1];
    const prev = arr[arr.length - 2];
    const lim = SIM.thresholds.shortSleepH;
    if (!last || Number(last.value) >= lim) { this.setAlert(`sleep:${aid}`, null); return; }
    const repeated = !!prev && Number(prev.value) < lim;
    this.setAlert(`sleep:${aid}`, {
      kind: 'sleep', subjectId: aid, level: repeated ? 'verify' : 'logged',
      title: repeated ? 'Repeated short sleep' : 'Short sleep logged',
      lines: [
        `Estimated sleep ${last.value} h ending ${fmtTime(last.measuredAt)} (algorithm estimate from wearable data, quality ${last.quality}).`,
        ...(repeated ? [`Previous night: ${prev!.value} h. Two nights below ${lim} h.`] : []),
        `Simulation parameter: sleep below ${lim} h → Logged; two consecutive nights → Verify.`,
      ],
      evidence: [last.id, ...(repeated ? [prev!.id] : [])],
    });
  }

  // ───────────────────────── symptoms, help, check-ins ─────────────────────────

  private envContext(aid: string, reportAt: number, onsetAt: number): { note: string; lines: string[]; evidence: string[] } {
    const S = this.S;
    const T = SIM.thresholds;
    const mod = moduleOf(astro(aid)!.moduleId)!;
    const from = reportAt - T.contextWindowMs;
    const inWin = (id: string) => seriesOf(S.series, id, 'co2').filter((o) => isValid(o) && !S.superseded.has(o.id) && o.measuredAt >= from && o.measuredAt <= reportAt);
    const own = inWin(mod.id);
    const lines: string[] = [];
    const evidence: string[] = [];
    let note: string;
    const others = MODULES.filter((m) => m.id !== mod.id)
      .map((m) => ({ m, el: inWin(m.id).filter((o) => Number(o.value) >= T.co2Verify) }))
      .filter((x) => x.el.length > 0);
    const otherLines = () => others.forEach(({ m, el }) => {
      const peak = el.reduce((a, b) => (Number(b.value) > Number(a.value) ? b : a));
      lines.push(`Elevated CO₂ was recorded in ${m.name} (${m.id}), up to ${peak.value} ppm at ${fmtTime(peak.measuredAt)} — a different location from this astronaut's module (${mod.name}, ${mod.id}). Not matched to this report.`);
      evidence.push(peak.id);
    });
    if (own.length === 0) {
      const lv = lastValid(S.series, S.superseded, mod.id, 'co2');
      note = 'Environmental context unavailable or stale';
      lines.push(lv
        ? `No ${mod.name} CO₂ reading in the 60 minutes before the report. The last valid reading was ${lv.value} ppm at ${fmtTime(lv.measuredAt)}, ${fmtAge(reportAt - lv.measuredAt)} before the report (sensor ${mod.sensorId}). It cannot be matched to the symptom timing.`
        : `No ${mod.name} CO₂ reading is available (sensor ${mod.sensorId}).`);
      if (lv) evidence.push(lv.id);
      otherLines();
    } else {
      const elevated = own.filter((o) => Number(o.value) >= T.co2Verify);
      const latest = own[own.length - 1];
      if (elevated.length === 0) {
        note = 'No elevated CO₂ in the astronaut\'s own module during the review window';
        const vals = own.map((o) => Number(o.value));
        lines.push(`${mod.name} CO₂ stayed between ${Math.min(...vals)} and ${Math.max(...vals)} ppm in the 60 minutes before the report (latest ${latest.value} ppm at ${fmtTime(latest.measuredAt)}, quality ${latest.quality}).`);
        evidence.push(latest.id);
        otherLines();
      } else {
        // Start of the contiguous elevated run that ends at the latest reading (looks back up to 3 h).
        const wide = seriesOf(S.series, mod.id, 'co2').filter((o) => isValid(o) && !S.superseded.has(o.id) && o.measuredAt >= reportAt - 3 * H && o.measuredAt <= reportAt);
        let first = elevated[0];
        for (let i = wide.length - 1; i >= 0 && Number(wide[i].value) >= T.co2Verify; i--) first = wide[i];
        const peak = elevated.reduce((a, b) => (Number(b.value) > Number(a.value) ? b : a));
        const stale = reportAt - latest.measuredAt > T.contextStaleMs;
        note = stale ? 'Environmental context may be stale' : 'Environmental context available for review';
        const rel = Math.round((first.measuredAt - onsetAt) / 60_000);
        lines.push(`Location: this astronaut is assigned to ${mod.name} (${mod.id}); CO₂ readings are from the same module (sensor ${mod.sensorId}).`);
        lines.push(`Timing: CO₂ was at or above ${T.co2Verify} ppm (simulation parameter) from ${fmtHM(first.measuredAt)}, peaking at ${peak.value} ppm at ${fmtHM(peak.measuredAt)}. Symptom onset was ${fmtHM(onsetAt)}, ${Math.abs(rel)} min ${rel <= 0 ? 'after CO₂ first exceeded that value' : 'before CO₂ first exceeded that value'}. Latest reading ${latest.value} ppm at ${fmtHM(latest.measuredAt)} (quality ${latest.quality}).`);
        lines.push('The readings overlap in time and place. The cause remains undetermined; no diagnosis is made.');
        evidence.push(first.id, peak.id, latest.id);
      }
    }
    return { note, lines, evidence };
  }

  reportSymptom(aid: string, p: { symptom: string; severity: number; onsetAt: number; note?: string; origin: Origin; region?: string }): Obs {
    const S = this.S;
    const simulated = p.origin === 'simulated-self-report';
    const o = this.mk(aid, 'symptom', p.symptom, S.now, simulated ? 'SIM-SELF-REPORT' : 'MANUAL', 'good', p.origin,
      { severity: p.severity, onsetAt: p.onsetAt, note: p.note ?? null, simulatedSelfReport: simulated, region: p.region ?? null });
    this.addObs(o);
    const ctx = this.envContext(aid, S.now, p.onsetAt);
    const sl = seriesOf(S.series, aid, 'sleep').filter((x) => isValid(x)).slice(-2);
    const lines = [
      `Reported: ${p.symptom}${p.region ? ` (${p.region})` : ''}, severity ${p.severity} of 5, onset ${fmtHM(p.onsetAt)} (${fmtAge(S.now - p.onsetAt)} before the report)${simulated ? ' — Simulated self-report' : ' — entered manually'}.`,
      ...(sl.length ? [`Sleep history: ${sl.map((x) => `${x.value} h (ended ${fmtHM(x.measuredAt)})`).join(', ')}.`] : []),
      ...ctx.lines,
      'Simulation rule: a symptom report with severity 3 or more → Review suggested; lower → Logged. Clinical diagnosis and treatment require approved rules.',
    ];
    const level: Level = p.severity >= 3 ? 'review' : 'logged';
    const a = this.newAlert({
      kind: 'symptom', subjectId: aid, level, title: `${p.symptom} reported`, lines,
      evidence: [o.id, ...ctx.evidence], contextNote: ctx.note, simulated,
    });
    this.emitAlert(a);
    this.bump(true);
    return o;
  }

  simulatedCheckin(aid: string, c: { mood: number; stress: number; fatigue: number }) {
    this.checkinObs(aid, this.S.now, c, 'simulated-self-report').forEach((o) => this.addObs(o));
    this.bump(true);
  }

  /** Works with incomplete readings: whatever exists is attached, whatever is missing is listed as unavailable. */
  requestHelp(aid: string, reason?: string, simulated = false): Alert {
    const S = this.S;
    const lines: string[] = [`Help requested by ${subjectName(aid)} at ${fmtTime(S.now)}${simulated ? ' (simulated request)' : ''}.${reason ? ` Reason given: "${reason}".` : ' No reason given.'}`];
    const evidence: string[] = [];
    const items: [Metric, string][] = [['heart_rate', 'Pulse'], ['bp_systolic', 'Blood pressure'], ['skin_temp', 'Skin temperature'], ['glucose', 'Sensor glucose']];
    for (const [m, label] of items) {
      const r = reading(S.series, S.superseded, S.now, aid, m);
      if (!r.obs) lines.push(`${label}: unavailable (no valid reading).`);
      else {
        let v = `${r.obs.value} ${r.obs.units}`;
        if (m === 'bp_systolic') { const d = lastValid(S.series, S.superseded, aid, 'bp_diastolic'); v = `${r.obs.value}/${d?.value ?? '?'} mmHg`; }
        const tag = r.state === 'current' ? 'current' : r.state === 'stale' ? 'stale' : 'device not reporting';
        lines.push(`${label}: ${v}, last valid at ${fmtTime(r.obs.measuredAt)} (${fmtAge(r.ageMs ?? 0)} ago, ${tag}, quality ${r.obs.quality}).`);
        evidence.push(r.obs.id);
      }
    }
    const devs = [...S.deviceMsgs.values()].filter((d) => d.active && d.subjectId === aid);
    devs.forEach((d) => lines.push(`Device status: ${d.text}`));
    lines.push('The request was sent without waiting for sensor data.');
    const a = this.newAlert({ kind: 'help', subjectId: aid, level: 'help', title: 'Help requested', lines, evidence, simulated });
    this.emitAlert(a);
    this.bump(true);
    return a;
  }

  setOnboardReview(alertId: string, status: 'requested' | 'reviewed') {
    const a = this.S.alerts.get(alertId);
    if (!a) return;
    a.onboardReview = status; a.version++; a.updatedAt = this.S.now;
    if (status === 'reviewed') a.status = 'closed';
    this.emitAlert(a);
    this.bump(true);
  }

  // ───────────────────────── manual entry and corrections (secondary) ─────────────────────────

  addManual(aid: string, metric: Metric, value: number, note?: string): Obs {
    const o = this.mk(aid, metric, value, this.S.now, 'MANUAL', 'good', 'manual', note ? { note } : undefined);
    this.addObs(o);
    if (metric === 'sleep') this.sleepRule(aid);
    this.bump(true);
    return o;
  }
  addManualBp(aid: string, sys: number, dia: number) {
    const meta = { cycleId: 'MANUAL', cycle: 'manual entry' };
    const s = this.mk(aid, 'bp_systolic', sys, this.S.now, 'MANUAL', 'good', 'manual', meta);
    const d = this.mk(aid, 'bp_diastolic', dia, this.S.now, 'MANUAL', 'good', 'manual', meta);
    this.addObs(s); this.addObs(d);
    this.bpRule(aid, s, d);
    this.bump(true);
  }

  /** Correct or exclude a reading. The original is kept; the correction links back to it. */
  correct(obsId: string, newValue: number | null, note?: string): Obs | null {
    const orig = this.S.byId.get(obsId);
    if (!orig || this.S.superseded.has(obsId)) return null;
    const excluded = newValue === null;
    const o = this.mk(orig.subjectId, orig.metric, excluded ? null : newValue, orig.measuredAt, 'MANUAL',
      excluded ? 'excluded' : 'good', 'manual',
      { correctedAt: this.S.now, originalValue: orig.value, note: note ?? null }, orig.id);
    this.addObs(o);
    this.bump(true);
    return o;
  }

  // ───────────────────────── Earth-side actions ─────────────────────────

  earthSetReview(alertId: string, status: EarthReviewStatus) {
    if (!this.S.earthAlerts.has(alertId)) return;
    this.S.earthReview[alertId] = { status, updatedAt: this.S.now };
    this.bump(true);
  }

  /** Ground reply travels back over the same link (and waits for it if it is down). */
  groundReply(alertId: string, text: string) {
    const S = this.S;
    if (!S.earthAlerts.has(alertId)) return;
    S.downlink.push({ alertId, text, arriveAt: S.now + S.comms.delayMs });
    if (S.earthReview[alertId]?.status === 'received') S.earthReview[alertId] = { status: 'under-review', updatedAt: S.now };
    this.bump(true);
  }

  /** Demo control: canned reply to the oldest case Earth has received and not yet replied to. */
  simulateGroundReply(): boolean {
    const S = this.S;
    const pending = [...S.earthAlerts.values()]
      .filter((x) => (x.alert.kind === 'symptom' || x.alert.kind === 'help') && !x.alert.groundReply
        && !S.downlink.some((d) => d.alertId === x.alert.id) && S.earthReview[x.alert.id]?.status !== 'reviewed')
      .sort((a, b) => a.receivedAt - b.receivedAt);
    if (!pending.length) return false;
    this.groundReply(pending[0].alert.id, 'Received. Please rest and re-check in 30 minutes; report any change. (Simulated ground reply — placeholder text, not medical advice.)');
    return true;
  }

  // ───────────────────────── settings & demo controls ─────────────────────────

  setSpeed(s: Speed) { this.S.speed = s; this.bump(true); }
  setViewer(id: string) { this.S.viewerId = id; this.bump(true); }
  setMcRole(r: McRole) { this.S.mcRole = r; this.bump(true); }

  /** Clearly labelled reset: clears demonstration records and replays the scenario from the start. */
  replay(id = this.S.scenarioId) { this.loadScenario(id); }

  // ───────────────────────── housekeeping ─────────────────────────

  /** Thin old high-rate samples to one per 15 minutes; never touches evidence, manual or low-rate records. */
  prune() {
    const S = this.S;
    const keep = new Set<string>();
    S.alerts.forEach((a) => a.evidence.forEach((e) => keep.add(e)));
    S.earthAlerts.forEach((x) => x.alert.evidence.forEach((e) => keep.add(e)));
    const cutoff = S.now - SIM.prune.fullResWindowMs;
    const thin = (map: SeriesMap, onRemove: (id: string) => void) => {
      for (const [k, arr] of map) {
        const metric = k.split('|')[1] as Metric;
        if (!THINNABLE.includes(metric) || arr.length < 200) continue;
        const out: Obs[] = [];
        let lastBucket = -1;
        for (const o of arr) {
          if (o.measuredAt >= cutoff || keep.has(o.id) || o.origin !== 'simulated') { out.push(o); continue; }
          const b = Math.floor(o.measuredAt / SIM.prune.bucketMs);
          if (b !== lastBucket) { lastBucket = b; out.push(o); } else onRemove(o.id);
        }
        if (out.length !== arr.length) map.set(k, out);
      }
    };
    thin(S.series, (id) => { S.byId.delete(id); this.dirty.observations.delete(id); this.dirty.delObs.add(id); });
    thin(S.earthSeries, (id) => { S.earth.delete(id); this.dirty.earth.delete(id); this.dirty.delEarth.add(id); });
  }
}

export { LEVEL_LABEL };
