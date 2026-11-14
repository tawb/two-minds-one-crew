// Bridge between the simulation state and the reading model: builds the environment (calibration dates, activity lookup)
// and returns readings, badges and baseline ranges for what the UI displays.

import { astro } from '../sim/crew';
import type { SimState } from '../sim/engine';
import { DAY } from '../sim/params';
import { seriesOf } from '../sim/selectors';
import type { Metric, Obs } from '../sim/types';
import { contextBucket, resolveRange, type ResolvedRange, type SessionReading } from './baseline';
import { READINGS_CONFIG } from './config';
import { badgesFor, toReading, type Badge, type Reading, type ReadingEnv } from './model';
import { suggest, worstPosition, type Suggestion } from './suggest';
import type { Position } from './baseline';
import type { AgingReference } from './reference';

export function envFor(S: SimState, aid: string): ReadingEnv {
  const act = seriesOf(S.series, aid, 'activity');
  return {
    nowMs: S.now,
    bpCalibratedAt: S.bpCalibratedAt[aid] ?? null,
    glucoseSensorStartAt: S.T0 - READINGS_CONFIG.glucoseSensor.simulatedSensorAgeDays * DAY,
    activityAt: (ms) => {
      let lo = 0, hi = act.length - 1, at = -1; // binary search: the latest activity sample at or before ms
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (act[mid].measuredAt <= ms) { at = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (at < 0 || ms - act[at].measuredAt > 15 * 60_000 || act[at].value === null) return 'unknown';
      return act[at].value === 'active' ? 'active' : 'resting';
    },
  };
}

export const readingOf = (S: SimState, aid: string, o: Obs | null): Reading | null => (o ? toReading(o, envFor(S, aid)) : null);

/** Badges for a displayed number. Cabin readings and non-physical metrics have none. */
export function badgesOf(S: SimState, aid: string, o: Obs | null, metric?: Metric): Badge[] {
  if (!o || o.subjectId !== aid) return [];
  if (metric && metric !== o.metric) return [];
  const r = readingOf(S, aid, o);
  return r ? badgesFor(r) : [];
}

/** All of a person's session-tagged readings of one metric, as reading-model values. Untagged history is not a session. */
export function sessionItems(S: SimState, aid: string, metric: Metric): SessionReading[] {
  const env = envFor(S, aid);
  const out: SessionReading[] = [];
  for (const o of seriesOf(S.series, aid, metric)) {
    const session = o.meta?.session;
    if (typeof session !== 'string' || S.superseded.has(o.id) || o.meta?.demo) continue;
    const r = toReading(o, env);
    if (r) out.push({ reading: r, session });
  }
  return out;
}

/** Which range a displayed reading is compared against: population reference until enough sessions, then the person's baseline. */
export function rangeOf(S: SimState, aid: string, o: Obs | null, aging: AgingReference | null): ResolvedRange | null {
  const r = readingOf(S, aid, o);
  const a = astro(aid);
  if (!r || !a || !o || typeof r.value !== 'number') return null;
  return resolveRange({
    metric: r.metric, value: r.value, bucket: contextBucket(r.context), items: sessionItems(S, aid, o.metric),
    age: a.age, sex: a.sex, aging,
  });
}

export interface ShownSuggestion { s: Suggestion; pos: Position; range: ResolvedRange; reading: Reading }

/** Tag, recommendation and range for a displayed reading. Blood pressure uses the worse of systolic and diastolic. */
export function suggestionFor(S: SimState, aid: string, obs: Obs | null, bp: boolean, aging: AgingReference | null): ShownSuggestion | null {
  const range = rangeOf(S, aid, obs, aging);
  const reading = readingOf(S, aid, obs);
  if (!range || !reading) return null;
  let pos = range.position;
  if (bp) {
    const dia = seriesOf(S.series, aid, 'bp_diastolic').filter((o) => !S.superseded.has(o.id) && o.value !== null && o.quality !== 'missing' && o.quality !== 'excluded');
    pos = worstPosition([range.position, rangeOf(S, aid, dia[dia.length - 1] ?? null, aging)?.position ?? 'unknown']);
  }
  const s = suggest({ metric: reading.metric, position: pos, quality: reading.quality, calibration: reading.calibration, context: reading.context });
  return { s, pos, range, reading };
}
