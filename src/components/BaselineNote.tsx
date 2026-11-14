import { useAging } from '../readings/referenceStore';
import { suggestionFor } from '../readings/view';
import { useSim } from '../sim/instance';
import type { Obs } from '../sim/types';

const POS = { within: 'within range', above: 'above range', below: 'below range', unknown: '' } as const;

/**
 * "using population reference" or "using your baseline (N sessions)", plus a coloured tag and short recommendations that
 * depend on the reading, its range and its context (placeholder wording, see readings/suggest.ts).
 * A normal reading gets a tag only.
 */
export default function BaselineNote({ aid, obs, bp = false, compact = false }: { aid: string; obs: Obs | null; bp?: boolean; compact?: boolean }) {
  const S = useSim().S;
  const aging = useAging();
  const x = suggestionFor(S, aid, obs, bp, aging);
  if (!x) return null;
  const { s, pos, range: r } = x;
  if (compact) {
    return (
      <>
        {s.tag && <span className={`bptag big bp-${pos}`}>{s.tag}</span>}
        {s.lines[0] && <span className="suggest-big">{s.lines[0]}</span>}
      </>
    );
  }
  return (
    <>
      <span className={`bnote bn-${r.mode}`} title={r.detail}>
        {r.label}
        {r.low !== null && r.high !== null && <> · {Math.round(r.low)} to {Math.round(r.high)}{r.unit ? ` ${r.unit}` : ''}</>}
        {!s.tag && POS[pos] && <> · {POS[pos]}</>}
      </span>
      {s.tag && <span className={`bptag bp-${pos}`}>{s.tag}</span>}
      {s.lines.map((l) => <span key={l} className="bnote suggest">{l}</span>)}
      {s.lines.length > 0 && <span className="bnote">Placeholder ranges and wording, not medical advice.</span>}
    </>
  );
}
