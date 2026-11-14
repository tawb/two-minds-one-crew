import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { buildNights, preferredNights, sleepTrend, type SleepNight, type Where } from '../readings/sleep';
import { astro } from '../sim/crew';
import { fmtDT } from '../sim/fmt';
import { useSim } from '../sim/instance';
import { seriesOf } from '../sim/selectors';

const SRC: Record<string, string> = { whoop: 'Band (simulated link)', replay: 'Replay: recorded or synthetic, not live' };
const VS: Record<Where, string> = { within: 'within your usual range', above: 'above your usual range', below: 'below your usual range' };
const hm = (h: number | null) => (h === null ? 'not available' : `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')} min`);

function Stages({ n }: { n: NonNullable<SleepNight['stages']> }) {
  const total = n.awakeMin + n.lightMin + n.deepMin + n.remMin || 1;
  const parts = [['Awake', n.awakeMin, 'st-awake'], ['Light', n.lightMin, 'st-light'], ['Deep', n.deepMin, 'st-deep'], ['REM', n.remMin, 'st-rem']] as const;
  return (
    <div>
      <div className="stagebar" role="img" aria-label={parts.map(([l, m]) => `${l} ${m} minutes`).join(', ')}>
        {parts.map(([l, m, c]) => <span key={l} className={c} style={{ width: `${(m / total) * 100}%` }} />)}
      </div>
      <ul className="stagelegend">{parts.map(([l, m, c]) => <li key={l}><i className={c} />{l} {m} min</li>)}</ul>
    </div>
  );
}

export default function Sleep() {
  const e = useSim();
  const S = e.S;
  const nav = useNavigate();
  const a = astro(S.viewerId)!;
  const sleep = seriesOf(S.series, a.id, 'sleep').filter((o) => !S.superseded.has(o.id));
  const hr = seriesOf(S.series, a.id, 'heart_rate').filter((o) => !S.superseded.has(o.id));
  const { nights, source } = preferredNights(buildNights(sleep, hr));
  const latest = nights[nights.length - 1];
  const tr = sleepTrend(nights);
  return (
    <section className="doc-page">
      <button className="back" onClick={() => nav(-1)} aria-label="Back"><Icon n="left" /> Back</button>
      <h1 className="hero">Sleep</h1>
      <p className="sub">{source ? SRC[source] : 'No sleep data yet'}</p>

      {!latest ? (
        <div className="psection"><p className="fine left">No nights recorded yet.</p></div>
      ) : (
        <>
          <div className="psection">
            <div className="vlabel">Last night · ended {fmtDT(latest.end)} UTC</div>
            <div className="sleepgrid">
              <div><span className="vlabel">Duration</span><div className="pvalue">{hm(latest.hours)}</div></div>
              <div><span className="vlabel">Efficiency</span><div className="pvalue">{latest.efficiencyPct === null ? 'n/a' : `${latest.efficiencyPct}`}<small>{latest.efficiencyPct === null ? '' : '%'}</small></div>{latest.efficiencyPct === null && <p className="fine left">This source does not estimate it.</p>}</div>
              <div><span className="vlabel">Resting pulse overnight</span><div className="pvalue">{latest.restingHr ?? 'n/a'}<small>{latest.restingHr === null ? '' : 'bpm'}</small></div>{latest.restingHr === null && <p className="fine left">Too few readings overnight.</p>}</div>
            </div>
            {latest.stages ? <Stages n={latest.stages} /> : <p className="fine left">Sleep stages: not provided by this source.</p>}
          </div>

          <div className="psection">
            <div className="vlabel">Compared with your own earlier nights</div>
            {tr.enough ? (
              <ul className="plain">
                <li>Duration {latest.hours !== null ? hm(latest.hours) : 'n/a'}: {tr.durationVs ? VS[tr.durationVs] : 'no comparison'} (median {hm(tr.durationMedian)} over {tr.basis} earlier nights).</li>
                <li>Overnight resting pulse {latest.restingHr ?? 'n/a'} bpm: {tr.restingHrVs ? VS[tr.restingHrVs] : 'not enough earlier readings to compare'}{tr.restingHrMedian !== null ? ` (median ${Math.round(tr.restingHrMedian)} bpm)` : ''}.</li>
              </ul>
            ) : (
              <p className="fine left">Needs 3 earlier nights ({tr.basis} so far).</p>
            )}
          </div>

          <div className="psection">
            <div className="vlabel">Nights</div>
            <div className="tablewrap">
              <table className="mini valtable">
                <thead><tr><th>Ended (UTC)</th><th>Duration</th><th>Efficiency</th><th>Resting pulse</th><th>Source</th></tr></thead>
                <tbody>
                  {[...nights].reverse().map((n) => (
                    <tr key={n.id}><td>{fmtDT(n.end)}</td><td>{hm(n.hours)}</td><td>{n.efficiencyPct === null ? 'n/a' : `${n.efficiencyPct} %`}</td><td>{n.restingHr === null ? 'n/a' : `${n.restingHr} bpm`}</td><td>{n.source === 'whoop' ? 'band' : 'replay'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <p className="fine backlink"><Link to="/vitals">Back to vitals</Link></p>
    </section>
  );
}
