import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import TrendChart from '../components/TrendChart';
import { READINGS_CONFIG } from '../readings/config';
import { activityMarkers, glucosePoints, glucoseStats, mealMarkers } from '../readings/glucose';
import { readingOf } from '../readings/view';
import { astro } from '../sim/crew';
import { fmtHM } from '../sim/fmt';
import { useSim } from '../sim/instance';
import { DAY, H } from '../sim/params';
import { seriesOf, windowOf } from '../sim/selectors';

const RANGES: [string, number][] = [['6 h', 6 * H], ['24 h', DAY], ['4 days', 4 * DAY]];

export default function Glucose() {
  const e = useSim();
  const S = e.S;
  const nav = useNavigate();
  const a = astro(S.viewerId)!;
  const [range, setRange] = useState(DAY);
  const [low, setLow] = useState<number>(READINGS_CONFIG.glucose.bandLowMgDl);
  const [high, setHigh] = useState<number>(READINGS_CONFIG.glucose.bandHighMgDl);
  const from = S.now - range, to = S.now;
  const gl = windowOf(seriesOf(S.series, a.id, 'glucose'), S.superseded, from, to);
  const act = windowOf(seriesOf(S.series, a.id, 'activity'), S.superseded, from, to);
  const stats = glucoseStats(glucosePoints(gl), { low, high });
  const meals = mealMarkers(gl).filter((m) => m.t >= from);
  const acts = activityMarkers(act);
  const markers = [...meals, ...acts].map((m) => ({ t: m.t, label: m.kind === 'meal' ? 'meal' : 'activity' }));
  const lastObs = [...gl].reverse().find((o) => o.value !== null) ?? null;
  const lastReading = readingOf(S, a.id, lastObs);
  const missing = gl.filter((o) => o.value === null).length;
  const f = (x: number, d = 0) => x.toFixed(d);
  return (
    <section className="doc-page">
      <button className="back" onClick={() => nav(-1)} aria-label="Back"><Icon n="left" /> Back</button>
      <h1 className="hero">Glucose</h1>
      <p className="banner info">Most public glucose data comes from people with diabetes. Nothing on this page is a diabetes threshold, and healthy-adult ranges for people in space are not established.</p>
      {lastReading?.calibration.state === 'calibrating' && <p className="banner warn">The glucose sensor is still warming up. Readings are labelled calibrating.</p>}

      <div className="seg small" role="group" aria-label="Time range">
        {RANGES.map(([l, r]) => <button key={l} className={range === r ? 'on' : ''} aria-pressed={range === r} onClick={() => setRange(r)}>{l}</button>)}
      </div>

      <TrendChart title="Sensor glucose" units="mg/dL" series={[{ name: 'Glucose', color: 'var(--accent)', points: gl }]} from={from} to={to} markers={markers} band={[low, high]} />
      <p className="fine left">Shaded band: placeholder {low} to {high} mg/dL.{missing ? ` ${missing} reading${missing === 1 ? '' : 's'} missing (sensor not reporting).` : ''}</p>

      {stats ? (
        <div className="psection">
          <div className="vlabel">Variability ({stats.n} readings, good quality only)</div>
          <div className="sleepgrid">
            <div><span className="vlabel">Time in band</span><div className="pvalue">{f(stats.timeInRange)}<small>%</small></div><p className="fine left">{f(stats.timeBelow)} % below, {f(stats.timeAbove)} % above</p></div>
            <div><span className="vlabel">Mean</span><div className="pvalue">{f(stats.mean)}<small>mg/dL</small></div></div>
            <div><span className="vlabel">SD</span><div className="pvalue">{f(stats.sd, 1)}<small>mg/dL</small></div></div>
            <div><span className="vlabel">CV</span><div className="pvalue">{f(stats.cv, 1)}<small>%</small></div></div>
          </div>
        </div>
      ) : <div className="psection"><p className="fine left">No glucose readings in this range.</p></div>}

      <div className="psection">
        <div className="vlabel">Band (placeholder, configurable)</div>
        <div className="ctxgrid">
          <label>Low, mg/dL<input type="number" value={low} min={40} max={high - 1} onChange={(ev) => setLow(Number(ev.target.value))} /></label>
          <label>High, mg/dL<input type="number" value={high} min={low + 1} max={300} onChange={(ev) => setHigh(Number(ev.target.value))} /></label>
        </div>
        <p className="fine left">Default {READINGS_CONFIG.glucose.bandLowMgDl} to {READINGS_CONFIG.glucose.bandHighMgDl} mg/dL. Placeholder, not sourced.</p>
      </div>

      {(meals.length > 0 || acts.length > 0) && (
        <div className="psection">
          <div className="vlabel">Timeline</div>
          <ul className="plain">
            {[...meals.map((m) => ({ ...m })), ...acts].sort((x, y) => y.t - x.t).slice(0, 12).map((m) => <li key={m.kind + m.t}>{fmtHM(m.t)} · {m.kind === 'meal' ? m.label : 'activity started'}</li>)}
          </ul>
        </div>
      )}
      <p className="fine backlink"><Link to="/vitals">Back to vitals</Link></p>
    </section>
  );
}
