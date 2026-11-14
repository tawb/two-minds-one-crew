// Pure, deterministic synthetic signal generator. Same inputs -> same values, so every replay
// is repeatable and live values agree with preloaded history (one function of simulated time).

import { ASTRONAUTS, MODULES, astro, residents } from './crew';
import { DAY, H } from './params';
import type { StoredContext } from '../readings/types';

export interface Ramp { start: number; end: number; holdUntil: number; peak: number } // minutes relative to T0

export interface ScenarioMods {
  co2Ramp?: Record<string, Ramp>;
  cabinOfflineFromMin?: Record<string, number>; // module sensor stops reporting at T0 + minutes
  shortSleep?: Record<string, number[]>; // [latest night, previous night] hours
  bpBoost?: Record<string, { sys: number; dia: number }>; // applies from T0 onward
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rnd(key: string, t: number): number {
  let x = hash(key) ^ Math.imul(Math.floor(t / 1000) + 1, 0x9e3779b1);
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
/** Triangular noise in [-amp, amp]. */
const noise = (key: string, t: number, amp: number) => (rnd(key, t) + rnd(key + 'b', t) - 1) * amp;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface SleepSession { start: number; end: number; hours: number }

export class Gen {
  constructor(public readonly T0: number, public readonly mods: ScenarioMods = {}) {}

  private kLatest() { return Math.floor(this.T0 / DAY) - 1; }

  sleepSession(aid: string, k: number): SleepSession {
    const p = astro(aid)!;
    let hours = 7 + noise(aid + 'sleep', k * DAY, 0.5);
    const short = this.mods.shortSleep?.[aid];
    if (short) {
      if (k === this.kLatest()) hours = short[0];
      else if (k === this.kLatest() - 1) hours = short[1];
    }
    const start = k * DAY + p.sleepStartH * H;
    return { start, end: Math.round(start + hours * H), hours };
  }

  asleep(aid: string, t: number): boolean {
    const k0 = Math.floor(t / DAY);
    for (const k of [k0, k0 - 1]) {
      const s = this.sleepSession(aid, k);
      if (t >= s.start && t < s.end) return true;
    }
    return false;
  }

  private exerciseWindow(aid: string, t: number): { start: number; end: number } {
    const p = astro(aid)!;
    const d0 = Math.floor(t / DAY) * DAY;
    const start = d0 + p.exerciseStartH * H;
    return { start, end: start + H };
  }
  exercising(aid: string, t: number) {
    const w = this.exerciseWindow(aid, t);
    return t >= w.start && t < w.end;
  }
  private minutesSinceExercise(aid: string, t: number): number {
    const w = this.exerciseWindow(aid, t);
    return t >= w.end ? (t - w.end) / 60_000 : Infinity;
  }

  activity(aid: string, t: number): 'resting' | 'active' {
    if (this.asleep(aid, t)) return 'resting';
    if (this.exercising(aid, t)) return 'active';
    return rnd(aid + 'act', Math.floor(t / 300_000) * 300_000) < 0.15 ? 'active' : 'resting';
  }

  hr(aid: string, t: number): number {
    const p = astro(aid)!;
    const n = (a: number) => noise(aid + 'hr', t, a);
    let v: number;
    if (this.asleep(aid, t)) v = p.restHR - 8 + n(2);
    else if (this.exercising(aid, t)) v = p.restHR + 78 + n(8);
    else if (this.activity(aid, t) === 'active') v = p.restHR + 28 + n(8);
    else {
      const m = this.minutesSinceExercise(aid, t);
      v = p.restHR + 8 + n(3) + (m < 20 ? 25 * Math.exp(-m / 4) : 0);
    }
    if (this.mods.shortSleep?.[aid] && !this.asleep(aid, t)) v += 3; // slightly raised resting pulse after short sleep
    return Math.round(v);
  }

  skinTemp(aid: string, t: number): number {
    const p = astro(aid)!;
    const tod = (t % DAY) / H;
    let v = p.skinTemp + 0.35 * Math.sin(((tod - 10) / 24) * 2 * Math.PI) + noise(aid + 'st', t, 0.12);
    if (this.asleep(aid, t)) v += 0.3;
    if (this.exercising(aid, t)) v += 0.6;
    return Math.round(v * 10) / 10;
  }

  glucose(aid: string, t: number): number {
    const p = astro(aid)!;
    const tod = (t % DAY) / H;
    let v = p.glucose + noise(aid + 'gl', t, 2.5);
    for (const meal of [7.5, 12.5, 18.5]) {
      const x = (tod - meal) * 60; // minutes after meal
      if (x >= 0) v += 38 * (x / 45) * Math.exp(1 - x / 45);
    }
    if (this.asleep(aid, t)) v -= 6;
    return Math.round(v);
  }

  private ramp(moduleId: string, t: number): number {
    const r = this.mods.co2Ramp?.[moduleId];
    if (!r) return 0;
    const m = (t - this.T0) / 60_000;
    if (m < r.start) return 0;
    if (m < r.end) return (r.peak * (m - r.start)) / (r.end - r.start);
    if (m < r.holdUntil) return r.peak;
    return Math.max(0, r.peak - (m - r.holdUntil) * 8);
  }

  co2(moduleId: string, t: number): number {
    const tod = (t % DAY) / H;
    let v = moduleId === 'M3' ? 690 + (tod >= 8 && tod < 18 ? 110 : 0) : 620;
    for (const r of residents(moduleId)) if (this.asleep(r.id, t)) v += 150; // sleeping occupants raise CO₂
    v += noise(moduleId + 'co2', t, 25) + this.ramp(moduleId, t);
    return Math.round(v);
  }

  cabinTemp(moduleId: string, t: number): number {
    return Math.round((22.4 + (moduleId === 'M3' ? 0.5 : 0) + noise(moduleId + 'ct', t, 0.25)) * 10) / 10;
  }
  cabinRh(moduleId: string, t: number): number {
    return Math.round(44 + (moduleId === 'M2' ? 2 : 0) + noise(moduleId + 'rh', t, 2));
  }
  cabinOfflineFrom(moduleId: string): number | undefined {
    const m = this.mods.cabinOfflineFromMin?.[moduleId];
    return m === undefined ? undefined : this.T0 + m * 60_000;
  }

  bp(aid: string, t: number): { sys: number; dia: number } {
    const p = astro(aid)!;
    let sys = p.sys + noise(aid + 'sys', t, 4);
    let dia = p.dia + noise(aid + 'dia', t, 3);
    const m = this.minutesSinceExercise(aid, t);
    if (m < 30) { sys += 14; dia += 5; }
    if (this.asleep(aid, t)) { sys -= 8; dia -= 5; }
    const boost = this.mods.bpBoost?.[aid];
    if (boost && t >= this.T0) { sys += boost.sys; dia += boost.dia; }
    return { sys: Math.round(sys), dia: Math.round(dia) };
  }

  checkin(aid: string, t: number, sleepHours: number): { mood: number; stress: number; fatigue: number } {
    const fatigue = clamp(Math.round(2 + (7 - sleepHours) * 0.9), 1, 5);
    const mood = clamp(Math.round(4 + noise(aid + 'mood', t, 1) - (fatigue >= 4 ? 1 : 0)), 1, 5);
    const stress = clamp(Math.round(2 + noise(aid + 'stress', t, 1) + (fatigue >= 4 ? 1 : 0)), 1, 5);
    return { mood, stress, fatigue };
  }

  /** What the simulated schedule says about posture, last exercise, last meal and last night's sleep at time t. */
  contextAt(aid: string, t: number): StoredContext {
    const p = astro(aid)!;
    const posture = this.asleep(aid, t) ? 'lying' : this.exercising(aid, t) ? 'standing' : 'seated';
    const d0 = Math.floor(t / DAY) * DAY;
    const todayStart = d0 + p.exerciseStartH * H;
    const exerciseAt = todayStart <= t ? Math.min(t, todayStart + H) : d0 - DAY + p.exerciseStartH * H + H;
    const meals = [7.5, 12.5, 18.5].map((h) => d0 + h * H).filter((m) => m <= t);
    const mealAt = meals.length ? meals[meals.length - 1] : d0 - DAY + 18.5 * H;
    let sleepHours: number | null = null;
    for (let k = Math.floor(t / DAY); k >= Math.floor(t / DAY) - 3; k--) {
      const s = this.sleepSession(aid, k);
      if (s.end <= t) { sleepHours = Math.round(s.hours * 10) / 10; break; }
    }
    return { posture, exerciseAt, mealAt, sleepHours, notes: null };
  }

  /** Next sleep-session end strictly after t, with its session. */
  nextSleepEnd(aid: string, t: number): SleepSession {
    let k = Math.floor(t / DAY) - 2;
    for (;;) {
      const s = this.sleepSession(aid, k);
      if (s.end > t) return s;
      k++;
    }
  }
}

export const ALL_SUBJECT_IDS = [...ASTRONAUTS.map((a) => a.id), ...MODULES.map((m) => m.id)];
