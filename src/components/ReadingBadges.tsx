import { badgesOf } from '../readings/view';
import { useSim } from '../sim/instance';
import type { Metric, Obs } from '../sim/types';

/** Quality, calibration and missing-context labels next to a number. Readings are labelled, never hidden. */
export default function ReadingBadges({ aid, obs, metric }: { aid: string; obs: Obs | null; metric?: Metric }) {
  const S = useSim().S;
  const b = badgesOf(S, aid, obs, metric);
  if (!b.length) return null;
  return (
    <span className="rbadges">
      {b.map((x) => <span key={x.key} className={`rbadge rb-${x.tone}`}>{x.text}</span>)}
    </span>
  );
}
