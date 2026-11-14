import { useAging } from '../readings/referenceStore';
import { suggestionFor } from '../readings/view';
import { useSim } from '../sim/instance';
import { vitals, type VitalKey } from '../sim/vitals';

const LISTED: VitalKey[] = ['pulse', 'bp', 'glucose', 'temp', 'sleep'];

/** The out-of-range vitals and what to do about each. Nothing is listed while everything is normal. */
export default function WhatToDo({ aid }: { aid: string }) {
  const S = useSim().S;
  const aging = useAging();
  const items = vitals(S, aid)
    .filter((v) => LISTED.includes(v.key) && v.state === 'current')
    .map((v) => ({ v, x: suggestionFor(S, aid, v.obs, v.key === 'bp', aging) }))
    .filter((r) => r.x?.s.action && (r.x.s.tag === 'High' || r.x.s.tag === 'Low'));
  if (!items.length) return null;
  return (
    <section className="todo" aria-label="What to do now">
      <h2>What to do now</h2>
      <ul>
        {items.map(({ v, x }) => (
          <li key={v.key}>
            <span className={`bptag bp-${x!.pos}`}>{v.label} {x!.s.tag}</span>
            <span>{x!.s.action}</span>
          </li>
        ))}
      </ul>
      <p className="fine left">If any of these is severe or you feel unwell, tell the flight surgeon.</p>
    </section>
  );
}
