import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Icon, Shape, VitalIcon } from '../components/icons';
import BaselineNote from '../components/BaselineNote';
import ReadingBadges from '../components/ReadingBadges';
import ReportSheet from '../components/ReportSheet';
import TrendChart from '../components/TrendChart';
import { astro } from '../sim/crew';
import { fmtAge, fmtHM, fmtTime } from '../sim/fmt';
import { DAY, H } from '../sim/params';
import { useSim } from '../sim/instance';
import { seriesOf, windowOf } from '../sim/selectors';
import { LEVEL_LABEL, type Obs } from '../sim/types';
import { REGIONS, vital, type RegionId, type VitalKey } from '../sim/vitals';
import { FlagChip } from './Vitals';
import { cvFlag, useCvStatus } from '../features/cv-response-check/cvStatus';

const RANGES: [string, number][] = [['6 h', 6 * H], ['24 h', DAY], ['4 days', 4 * DAY]];

function ActivityBars({ points, from, to }: { points: Obs[]; from: number; to: number }) {
  const hours = Math.max(1, Math.round((to - from) / H));
  const buckets = Array.from({ length: Math.min(hours, 24) }, () => ({ a: 0, n: 0 }));
  const span = (to - from) / buckets.length;
  for (const o of points) {
    if (o.value === null) continue;
    const i = Math.min(buckets.length - 1, Math.floor((o.measuredAt - from) / span));
    buckets[i].n++;
    if (o.value === 'active') buckets[i].a++;
  }
  return (
    <figure className="chart">
      <figcaption><b>Time active</b> <span className="muted">(% of each period)</span></figcaption>
      <svg viewBox="0 0 640 150" role="img" aria-label="Activity per period">
        {buckets.map((b, i) => {
          const pct = b.n ? b.a / b.n : 0;
          const w = 640 / buckets.length;
          return <rect key={i} x={i * w + 3} width={w - 6} y={130 - pct * 110} height={Math.max(2, pct * 110)} rx="4" className="bar" />;
        })}
        <text x="4" y="146" className="axis">{fmtHM(from)}</text>
        <text x="636" y="146" textAnchor="end" className="axis">{fmtHM(to)}</text>
      </svg>
    </figure>
  );
}

function Section({ k, aid }: { k: VitalKey; aid: string }) {
  const e = useSim();
  const S = e.S;
  const [range, setRange] = useState(DAY);
  const v = vital(S, aid, k);
  const from = S.now - range, to = S.now;
  const pts = (subject: string, m: Parameters<typeof seriesOf>[2]) => windowOf(seriesOf(S.series, subject, m), S.superseded, from, to);
  const series = k === 'bp'
    ? [{ name: 'Systolic', color: 'var(--accent)', points: pts(aid, 'bp_systolic') }, { name: 'Diastolic', color: 'var(--amber)', points: pts(aid, 'bp_diastolic') }]
    : [{ name: v.label, color: 'var(--accent)', points: pts(v.subject, v.metric) }];
  const markers = (k === 'air' || k === 'pulse')
    ? seriesOf(S.series, aid, 'symptom').filter((o) => !S.superseded.has(o.id)).flatMap((o) => [{ t: Number(o.meta?.onsetAt ?? o.measuredAt), label: 'onset' }])
    : [];
  return (
    <div className="psection">
      <div className="phead">
        <span className="vicon sm"><VitalIcon k={k} size={22} /></span>
        <div>
          <div className="vlabel">{v.label}</div>
          {k !== 'activity' && <div className="pvalue">{v.value ?? '—'}<small>{v.value ? v.unit : ''}</small></div>}
        </div>
        {k !== 'activity' && <FlagChip v={v} />}
      </div>
      {k !== 'activity' && <ReadingBadges aid={aid} obs={v.obs} />}
      {k !== 'activity' && k !== 'air' && k !== 'sleep' && <BaselineNote aid={aid} obs={v.obs} bp={v.key === 'bp'} />}
      {k === 'sleep' && <Link className="btn-secondary linkbtn" to="/vitals?tab=sleep">Sleep summary</Link>}
      {k === 'glucose' && <Link className="btn-secondary linkbtn" to="/vitals?tab=glucose">Glucose detail</Link>}
      {k === 'bp' && <button className="btn-secondary" onClick={() => e.calibrateBp(aid)}>Calibrate cuff now (simulated)</button>}
      <div className="seg small" role="group" aria-label="Time range">
        {RANGES.map(([l, r]) => <button key={l} className={range === r ? 'on' : ''} aria-pressed={range === r} onClick={() => setRange(r)}>{l}</button>)}
      </div>
      {k === 'activity'
        ? <ActivityBars points={pts(aid, 'activity')} from={from} to={to} />
        : <TrendChart compact title={v.label} units={v.unit} series={series} from={from} to={to} markers={markers} />}
      {v.obs && <p className="fine left">{v.obs.deviceId} · {fmtTime(v.obs.measuredAt)} ({fmtAge(S.now - v.obs.measuredAt)} ago) · {v.obs.origin === 'simulated' ? 'Simulated' : v.obs.origin} · quality {v.obs.quality}</p>}
    </div>
  );
}

function ResponseCheckCard({ userId }: { userId: string }) {
  const last = useCvStatus(userId);
  const f = cvFlag(last);
  return (
    <div className="psection">
      <div className="phead">
        <div>
          <div className="vlabel">Mental check</div>
          <div className="pvalue" style={{ fontSize: '1.4rem' }}>{last ? last.state : 'Not run yet'}</div>
        </div>
        {last && <span className={`pill ${f === 'review' ? 'pill-review' : f === 'verify' ? 'pill-warn' : 'pill-ok'}`}>{f === 'ok' ? <><Icon n="check" /> OK</> : f === 'verify' ? <><Shape n="triangle" /> Watch</> : <><Shape n="diamond" /> Check-in</>}</span>}
      </div>
      <p className="fine left">An alertness check against your own usual. Not a diagnosis.{last ? ` Last run ${new Date(last.timestamp).toLocaleString()}.` : ''}</p>
      <Link className="btn-secondary" to="/response-check" style={{ display: 'inline-block', padding: '.6rem 1.2rem', borderRadius: 999 }}>Run mental check</Link>
    </div>
  );
}

export default function Part() {
  const { region = '' } = useParams();
  const e = useSim();
  const S = e.S;
  const nav = useNavigate();
  const [reporting, setReporting] = useState(false);
  if (!(region in REGIONS)) return <Navigate to="/home" replace />;
  const def = REGIONS[region as RegionId];
  const a = astro(S.viewerId)!;
  const reports = seriesOf(S.series, a.id, 'symptom').filter((o) => !S.superseded.has(o.id) && o.meta?.region === def.id).slice(-4).reverse();
  return (
    <section className="part-page">
      <button className="back" onClick={() => nav(-1)} aria-label="Back"><Icon n="left" /> Back</button>
      <div className="vhead">
        <h1 className="hero">{def.label}</h1>
        <button className="btn-primary" onClick={() => setReporting(true)}>Report a problem</button>
      </div>
      {def.keys.map((k) => <Section key={k} k={k} aid={a.id} />)}
      {def.id === 'head' && <ResponseCheckCard userId={a.id} />}
      {reports.length > 0 && (
        <div className="psection">
          <div className="vlabel">Your reports</div>
          <ul className="reports">
            {reports.map((o) => {
              const al = [...S.alerts.values()].find((x) => x.evidence[0] === o.id);
              return <li key={o.id}><b>{String(o.value)}</b> · {Number(o.meta?.severity)}/5 · {fmtTime(o.measuredAt)}{al && <span className="pill pill-warn">{LEVEL_LABEL[al.level]}</span>}</li>;
            })}
          </ul>
        </div>
      )}
      <p className="fine"><Link to={`/astronaut/${a.id}`}>Full history</Link></p>
      {reporting && <ReportSheet aid={a.id} region={def.id} onClose={() => setReporting(false)} />}
    </section>
  );
}
