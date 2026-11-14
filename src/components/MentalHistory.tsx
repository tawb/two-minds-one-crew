import { loadCameraRecords } from '../readings/cvBridge';
import { reactionLabel } from '../readings/mental';
import { loadSurveys } from '../readings/survey';

interface Row { id: string; at: string; kind: string; value: string; label: string | null }

/** Mental check results for one astronaut: survey scores and reaction results, newest first. */
export default function MentalHistory({ aid }: { aid: string }) {
  const rows: Row[] = [
    ...loadSurveys().filter((s) => s.subjectId === aid).map((s) => ({ id: s.id, at: s.timestamp, kind: 'Survey', value: `${s.score}%`, label: s.label as string | null })),
    ...loadCameraRecords().filter((c) => c.subjectId === aid).map((c) => ({ id: c.id, at: c.timestamp, kind: 'Reaction time', value: c.medianReactionMs !== null ? `${Math.round(c.medianReactionMs)} ms` : 'n/a', label: reactionLabel(c.state) as string | null })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  if (!rows.length) return null;
  return (
    <div className="panel">
      <h2>Mental check</h2>
      <ul className="plain mh">
        {rows.map((r) => (
          <li key={r.id}><span>{new Date(r.at).toLocaleString()}</span><b>{r.kind}</b><span>{r.value}</span>{r.label && <span className={`pill mh-l ${r.label === 'Good' ? 'pill-ok' : r.label === 'Watch' ? 'pill-warn' : 'pill-review'}`}>{r.label}</span>}</li>
        ))}
      </ul>
    </div>
  );
}
