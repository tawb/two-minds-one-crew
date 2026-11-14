import { AGO_PRESETS, presetIndexFor } from '../readings/context';
import type { Posture } from '../readings/types';
import { useSim } from '../sim/instance';

const POSTURES: { id: Posture; label: string }[] = [
  { id: 'unknown', label: 'Unknown' }, { id: 'seated', label: 'Seated' }, { id: 'standing', label: 'Standing' }, { id: 'lying', label: 'Lying' },
];
const SLEEP: { label: string; hours: number | null }[] = [
  { label: 'Unknown', hours: null }, { label: 'Under 5 h', hours: 4.5 }, { label: '5 to 6 h', hours: 5.5 }, { label: '6 to 7 h', hours: 6.5 },
  { label: '7 to 8 h', hours: 7.5 }, { label: 'Over 8 h', hours: 8.5 },
];

/** Optional context attached to every new reading. Every field may stay unknown and nothing here blocks a measurement. */
export default function ContextPanel({ aid }: { aid: string }) {
  const e = useSim();
  const S = e.S;
  const c = S.contexts[aid] ?? { posture: 'unknown', exerciseAt: null, mealAt: null, sleepHours: null, notes: null };
  const ago = (m: number | null) => (m === null ? null : S.now - m * 60_000);
  const sleepIdx = c.sleepHours === null ? 0 : Math.max(0, SLEEP.findIndex((s) => s.hours === c.sleepHours));
  return (
    <details className="ctxpanel">
      <summary>Context for new readings</summary>
      <div className="ctxgrid">
        <label>Posture
          <select value={c.posture} onChange={(ev) => e.setContext(aid, { posture: ev.target.value as Posture })}>
            {POSTURES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label>Last exercise
          <select value={presetIndexFor(c.exerciseAt, S.now)} onChange={(ev) => e.setContext(aid, { exerciseAt: ago(AGO_PRESETS[Number(ev.target.value)].minutes) })}>
            {AGO_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
          </select>
        </label>
        <label>Last meal
          <select value={presetIndexFor(c.mealAt, S.now)} onChange={(ev) => e.setContext(aid, { mealAt: ago(AGO_PRESETS[Number(ev.target.value)].minutes) })}>
            {AGO_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
          </select>
        </label>
        <label>Last night's sleep
          <select value={sleepIdx} onChange={(ev) => e.setContext(aid, { sleepHours: SLEEP[Number(ev.target.value)].hours })}>
            {SLEEP.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
          </select>
        </label>
      </div>
    </details>
  );
}
