import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import last from '../validation/last-result.json';
import { notRun, type ValidationResult } from '../validation/run';

const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');

export default function Validation() {
  const nav = useNavigate();
  const r = ((last as ValidationResult).status === 'ok' ? last : notRun()) as ValidationResult;
  return (
    <section className="doc-page">
      <button className="back" onClick={() => nav(-1)} aria-label="Back"><Icon n="left" /> Back</button>
      <h1 className="hero">Validation</h1>

      <p className="banner warn">The estimator being tested is a placeholder. The app shows cuff readings only. It has no real cuffless blood pressure estimator.</p>

      {r.status === 'not-run' ? (
        <div className="psection">
          <div className="vlabel">No result yet</div>
          <p className="fine left">Run <code>npm run fetch-data</code>, then <code>npm run validate:bp</code>. The result appears here.</p>
        </div>
      ) : (
        <div className="psection">
          <div className="vlabel">Last result</div>
          <p className="fine left">{r.dataset} · {r.license} · {r.subjects} people · {r.testPoints} test points · run {r.ranAt ? new Date(r.ranAt).toLocaleString() : ''}</p>
          <div className="tablewrap">
            <table className="mini valtable">
              <thead><tr><th>Estimator</th><th>BP</th><th>n</th><th>Mean error</th><th>SD</th><th>Within 10 mmHg</th></tr></thead>
              <tbody>
                {r.variants.flatMap((v) => ([['Systolic', v.sys], ['Diastolic', v.dia]] as const).map(([k, s]) => (
                  <tr key={v.id + k}><td>{v.label}</td><td>{k}</td><td>{s.n}</td><td>{fmt(s.meanError)} mmHg</td><td>{fmt(s.sd)}</td><td>{fmt(s.pctWithin10, 0)} %</td></tr>
                )))}
              </tbody>
            </table>
          </div>
          <p className="fine left">Method: {r.method}</p>
        </div>
      )}

      <div className="psection">
        <div className="vlabel">Limits</div>
        <ul className="plain">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
    </section>
  );
}
