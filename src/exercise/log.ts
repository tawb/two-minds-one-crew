// Logged exercise sessions. The astronaut's own entries are kept on the device. A deterministic SIMULATED history for the
// fictional crew is added so the card has something to show; it is labelled "Simulated" wherever it appears.

import { maxHr, type ExerciseSession, type Lift } from './rules';

const DAY = 86_400_000;
const H = 3_600_000;
const KEY = 'av:exercise-log:v1';
const MAX = 400;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const safeStorage = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function loadLogged(storage: Pick<Storage, 'getItem'> | null = safeStorage()): ExerciseSession[] {
  try {
    const raw = storage?.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as ExerciseSession[]) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function addSession(s: ExerciseSession, storage: Store | null = safeStorage()): void {
  try { storage?.setItem(KEY, JSON.stringify([...loadLogged(storage).filter((x) => x.id !== s.id), s].slice(-MAX))); } catch { /* storage unavailable: not kept */ }
}

// ───────────── simulated history ─────────────
/** Base loads (kg) per ARED exercise for each fictional astronaut. */
const BASE_LOAD: Record<string, Record<string, number>> = {
  A1: { Squat: 80, Deadlift: 90, 'Heel raise': 100, 'Bench press': 55 },
  A2: { Squat: 95, Deadlift: 105, 'Heel raise': 110, 'Bench press': 70 },
  A3: { Squat: 70, Deadlift: 80, 'Heel raise': 90, 'Bench press': 45 },
  A4: { Squat: 90, Deadlift: 100, 'Heel raise': 105, 'Bench press': 65 },
};
/** How the most recent week compares with the earlier weeks, per astronaut (demo scenarios). */
const LAST_WEEK: Record<string, { mult: number; skipDays: number[]; intensity?: number }> = {
  A1: { mult: 1.0, skipDays: [] },
  A2: { mult: 0.9, skipDays: [], intensity: 0.64 }, // enough minutes, but easy: below the minimum dose
  A3: { mult: 0.85, skipDays: [2] }, // one missed day and lighter sessions: about 70% of baseline, high-risk
  A4: { mult: 0.97, skipDays: [] },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Five weeks of simulated sessions ending at `now`: one aerobic and one resistance session on six days out of seven. */
export function simulatedSessions(aid: string, age: number, now: number): ExerciseSession[] {
  const loads = BASE_LOAD[aid] ?? BASE_LOAD.A1;
  const scen = LAST_WEEK[aid] ?? LAST_WEEK.A1;
  const day0 = Math.floor(now / DAY) * DAY;
  const out: ExerciseSession[] = [];
  for (let k = 34; k >= 0; k--) {
    if (k % 7 === 4) continue; // one rest day a week
    const lastWeek = k <= 6;
    if (lastWeek && scen.skipDays.includes(k)) continue;
    const mult = lastWeek ? scen.mult : 1;
    const j = (key: string) => 0.94 + hash(`${aid}${k}${key}`) * 0.12; // +/- 6% day-to-day
    const base = day0 - k * DAY;
    const hrFrac = (lastWeek && scen.intensity ? scen.intensity : 0.78) + (hash(`${aid}${k}hr`) - 0.5) * 0.04;
    out.push({ id: `SIM-${aid}-${k}-a`, subjectId: aid, at: base + 9 * H, kind: 'aerobic', minutes: Math.round(30 * mult * j('a')), avgHr: Math.round(maxHr(age) * hrFrac), simulated: true });
    const lifts: Lift[] = Object.entries(loads).map(([exercise, kg]) => ({ exercise, loadKg: Math.round(kg * mult * j(exercise)), sets: 3, reps: 10 }));
    out.push({ id: `SIM-${aid}-${k}-r`, subjectId: aid, at: base + 10 * H, kind: 'resistance', minutes: Math.round(45 * mult * j('r')), lifts, simulated: true });
  }
  return out.filter((s) => s.at <= now);
}

/** Simulated history plus what this astronaut has logged. */
export function allSessions(aid: string, age: number, now: number, logged: ExerciseSession[] = loadLogged()): ExerciseSession[] {
  return [...simulatedSessions(aid, age, now), ...logged.filter((s) => s.subjectId === aid)].sort((a, b) => a.at - b.at);
}
