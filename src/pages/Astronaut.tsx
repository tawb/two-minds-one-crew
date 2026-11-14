import { useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import MentalHistory from '../components/MentalHistory';
import { AlertCard, CuffPanel, HelpButton, ReadingTile } from '../components/panels';
import TrendChart from '../components/TrendChart';
import { LevelBadge, NoPrompts, OriginChip, Provenance, QualityChip, Tabs } from '../components/ui';
import { astro, moduleOf } from '../sim/crew';
import { fmtAge, fmtDT, fmtHM, fmtTime, fmtValue } from '../sim/fmt';
import { H, DAY } from '../sim/params';
import { useSim } from '../sim/instance';
import { lastValid, reading, seriesOf, windowOf } from '../sim/selectors';
import { LEVEL_RANK, METRIC_LABEL, type Metric, type Obs } from '../sim/types';

type Tab = 'now' | 'trends' | 'wellbeing' | 'devices' | 'history';
const TABS: [Tab, string][] = [
  ['now', 'Now'], ['trends', 'Trends'], ['wellbeing', 'Well-being'], ['devices', 'Devices'],
  ['history', 'History'],
];

export default function Astronaut({ id: idProp, embedded = false, initialTab = 'now' }: { id?: string; embedded?: boolean; initialTab?: Tab } = {}) {
  const { id: routeId = '' } = useParams();
  const [sp] = useSearchParams();
  const id = idProp ?? routeId;
  const e = useSim();
  const S = e.S;
  const a = astro(id);
  const [tab, setTab] = useState<Tab>(initialTab);
  if (['manual', 'future', 'concepts'].includes(sp.get('tab') ?? '')) return <Navigate to="/vitals" replace />; // removed tabs
  if (!a) return <Navigate to="/" replace />;
  const mod = moduleOf(a.moduleId)!;
  const open = [...S.alerts.values()].filter((x) => x.subjectId === a.id && x.status === 'open').sort((x, y) => LEVEL_RANK[y.level] - LEVEL_RANK[x.level]);

  return (
    <section>
      {!embedded && <div className="page-head">
        <div>
          <h1 className="hero">{a.name}</h1>
          <p className="muted">{a.role} · {mod.name} · fictional</p>
        </div>
        <div className="head-actions">
          {open[0] ? <LevelBadge level={open[0].level} /> : <NoPrompts />}
          {S.viewerId !== a.id && <HelpButton aid={a.id} label={`Help for ${a.name.split(' ')[0]}`} />}
        </div>
      </div>}
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Astronaut details sections" />
      {tab === 'now' && <NowTab aid={a.id} />}
      {tab === 'trends' && <TrendsTab aid={a.id} />}
      {tab === 'wellbeing' && <WellbeingTab aid={a.id} />}
      {tab === 'devices' && <DevicesTab aid={a.id} />}
      {tab === 'history' && <HistoryTab aid={a.id} />}
    </section>
  );
}

// Now
function NowTab({ aid }: { aid: string }) {
  const e = useSim();
  const S = e.S;
  const a = astro(aid)!;
  const open = [...S.alerts.values()].filter((x) => x.subjectId === aid && x.status === 'open').sort((x, y) => LEVEL_RANK[y.level] - LEVEL_RANK[x.level]);
  const cabin = [...S.alerts.values()].filter((x) => x.kind === 'cabin' && x.subjectId === a.moduleId && x.status === 'open');
  const devs = [...S.deviceMsgs.values()].filter((m) => m.active && m.subjectId === aid);
  return (
    <div>
      {devs.map((m) => (
        <p key={m.id} className="banner warn"><b><Icon n="warn" /> Device status:</b> {m.text}</p>
      ))}
      {open.length === 0 && cabin.length === 0 && <p className="panel"><NoPrompts /> No prompts for this crew member.</p>}
      {[...open, ...cabin].map((x) => <AlertCard key={x.id} alert={x} />)}
      <div className="tiles">
        <ReadingTile label="Pulse" metric="heart_rate" subjectId={aid} />
        <ReadingTile label="Activity" metric="activity" subjectId={aid} />
        <ReadingTile label="Blood pressure" metric="bp_systolic" pairWith="bp_diastolic" subjectId={aid} />
        <ReadingTile label="Skin temperature" metric="skin_temp" subjectId={aid} />
        <ReadingTile label="Sensor glucose" metric="glucose" subjectId={aid} />
        <ReadingTile label="Estimated sleep (last session)" metric="sleep" subjectId={aid} />
        <ReadingTile label={`Cabin CO₂ (${a.moduleId})`} metric="co2" subjectId={a.moduleId} />
      </div>
    </div>
  );
}

// Trends
const RANGES: [string, number][] = [['6 h', 6 * H], ['24 h', DAY], ['4 days', 4 * DAY]];

function Caption({ subject, metric }: { subject: string; metric: Metric }) {
  const e = useSim();
  const S = e.S;
  const o = lastValid(S.series, S.superseded, subject, metric);
  return <p className="prov chart-src">{o ? <>Last: <b>{fmtValue(o.value, o.units)}</b> · <Provenance o={o} now={S.now} /></> : 'No readings.'}</p>;
}

function TrendsTab({ aid }: { aid: string }) {
  const e = useSim();
  const S = e.S;
  const a = astro(aid)!;
  const [range, setRange] = useState(RANGES[1][1]);
  const from = S.now - range, to = S.now;
  const w = (subject: string, m: Metric) => windowOf(seriesOf(S.series, subject, m), S.superseded, from, to);
  const markers = seriesOf(S.series, aid, 'symptom').filter((o) => !S.superseded.has(o.id)).flatMap((o) => {
    const onset = Number(o.meta?.onsetAt ?? o.measuredAt);
    return [{ t: onset, label: 'onset' }, { t: o.measuredAt, label: 'report' }];
  });
  return (
    <div>
      <div className="actions" role="group" aria-label="Time range">
        {RANGES.map(([l, v]) => <button key={l} className={range === v ? 'on' : ''} aria-pressed={range === v} onClick={() => setRange(v)}>{l}</button>)}
      </div>
      <div className="charts">
        <div className="panel">
          <TrendChart title="Pulse" units="bpm" from={from} to={to} markers={markers} series={[{ name: 'Pulse', color: 'var(--cyan)', points: w(aid, 'heart_rate') }]} />
          <Caption subject={aid} metric="heart_rate" />
        </div>
        <div className="panel">
          <TrendChart title="Blood pressure" units="mmHg" from={from} to={to}
            series={[{ name: 'Systolic', color: 'var(--cyan)', points: w(aid, 'bp_systolic') }, { name: 'Diastolic', color: 'var(--amber)', points: w(aid, 'bp_diastolic') }]} />
          <Caption subject={aid} metric="bp_systolic" />
        </div>
        <div className="panel">
          <TrendChart title="Skin temperature" units="°C" from={from} to={to} series={[{ name: 'Skin temperature', color: 'var(--green)', points: w(aid, 'skin_temp') }]} />
          <Caption subject={aid} metric="skin_temp" />
        </div>
        <div className="panel">
          <TrendChart title="Glucose" units="mg/dL" from={from} to={to} series={[{ name: 'Glucose', color: 'var(--amber)', points: w(aid, 'glucose') }]} />
          <Caption subject={aid} metric="glucose" />
        </div>
        <div className="panel">
          <TrendChart title="Sleep" units="h" from={S.now - 4 * DAY} to={to} series={[{ name: 'Sleep', color: 'var(--cyan)', points: w(aid, 'sleep') }]} />
          <Caption subject={aid} metric="sleep" />
        </div>
        <div className="panel">
          <TrendChart title={`Cabin CO₂ (${a.moduleId})`} units="ppm" from={from} to={to} markers={markers}
            series={[{ name: 'CO₂', color: 'var(--red)', points: w(a.moduleId, 'co2') }]} />
          <Caption subject={a.moduleId} metric="co2" />
        </div>
      </div>
    </div>
  );
}

// Well-being & symptoms
function WellbeingTab({ aid }: { aid: string }) {
  const e = useSim();
  const S = e.S;
  const own = S.viewerId === aid;
  const symptoms = seriesOf(S.series, aid, 'symptom').filter((o) => !S.superseded.has(o.id));
  const lines = (['mood', 'stress', 'fatigue'] as const).map((m) => ({ m, r: reading(S.series, S.superseded, S.now, aid, m) }));
  const sleeps = seriesOf(S.series, aid, 'sleep').filter((o) => o.value !== null).slice(-4);
  return (
    <div>
      <div className="panel">
        <h2>Symptoms</h2>
        {symptoms.length === 0 ? <p className="muted">No reports.</p> : (
          <ul className="plain">
            {symptoms.slice().reverse().map((o) => (
              <li key={o.id}>
                <b>{String(o.value)}</b>, severity {String(o.meta?.severity)} of 5 · onset {fmtHM(Number(o.meta?.onsetAt))} · reported {fmtDT(o.measuredAt)}
                {' '}<OriginChip origin={o.origin} />{o.meta?.note ? <><br /><span className="muted">“{String(o.meta.note)}”</span></> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="panel">
        <h2>Well-being <span className="chip">Private</span></h2>
        {!own ? (
          <p className="banner warn" role="note"><Icon n="lock" /> Private. Only this crew member and the flight surgeon can see these.</p>
        ) : (
          <>
            <p className="chip origin-simulated-self-report">Simulated self-report</p>
            <p className="muted">Generated automatically for the demo. A real system needs the person's own report.</p>
            <div className="tiles">
              {lines.map(({ m, r }) => (
                <div className="tile" key={m}>
                  <div className="tile-label">{METRIC_LABEL[m]}</div>
                  <div className="tile-value">{r.obs ? String(r.obs.value) : '—'} <small>/ 5</small></div>
                  {r.obs && <div className="prov"><Provenance o={r.obs} now={S.now} /></div>}
                </div>
              ))}
            </div>
            <h3>Recent sleep</h3>
            <ul className="plain">
              {sleeps.map((o) => <li key={o.id}>{fmtValue(o.value, o.units)} · ended {fmtDT(o.measuredAt)} · <QualityChip quality={o.quality} /> <OriginChip origin={o.origin} /></li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// Devices
function DevicesTab({ aid }: { aid: string }) {
  const e = useSim();
  const S = e.S;
  const a = astro(aid)!;
  const ids = [`BAND-${aid}`, `CUFF-${aid}`, `CGM-${aid}`, moduleOf(a.moduleId)!.sensorId];
  return (
    <div>
      <CuffPanel aid={aid} />
      <div className="panel">
        <h2>Devices <span className="chip">Simulated</span></h2>
        <table className="mini">
          <thead><tr><th>Device</th><th>Status</th><th>Battery</th><th>Last data</th></tr></thead>
          <tbody>
            {ids.map((id) => {
              const d = S.devices[id];
              return (
                <tr key={id}>
                  <th scope="row">{d.id}<br /><small>{d.label}</small></th>
                  <td><span className={`chip ds-${d.state}`}>{d.state === 'ok' ? <><Icon n="check" /> Connected</> : d.state === 'disconnected' ? <><Icon n="warn" /> Disconnected</> : <><Icon n="wave" /> Poor contact</>}</span></td>
                  <td>{d.battery === null ? 'n/a' : `${Math.round(d.battery)}%${d.battery < 20 ? ' (low)' : ''}`}</td>
                  <td>{d.lastValidAt ? `${fmtTime(d.lastValidAt)} (${fmtAge(S.now - d.lastValidAt)} ago)` : 'none'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {[...S.deviceMsgs.values()].filter((m) => m.subjectId === aid || m.subjectId === a.moduleId).slice(-6).reverse().map((m) => (
          <p key={m.id} className={m.active ? 'banner warn' : 'muted'}>{m.active ? <><Icon n="warn" /> </> : <><Icon n="check" /> resolved · </>}{fmtTime(m.updatedAt)} — {m.text}</p>
        ))}
      </div>
      <div className="panel">
        <h2>Proposed hardware</h2>
        <ul>
          <li><b>Band</b>: custom wearable inspired by WHOOP. Pulse, motion, skin temperature.</li>
          <li><b>Cuff</b>: own battery, upper arm. Deflates automatically on failure.</li>
          <li><b>Glucose patch</b>: commercial CGM as the reference.</li>
          <li><b>Cabin sensors</b>: CO₂, temperature and humidity per module.</li>
        </ul>
        <p className="muted">Unverified concept.</p>
      </div>
    </div>
  );
}

// History
function statusOf(S: ReturnType<typeof useSim>['S'], o: Obs): [string, string] {
  if (S.superseded.has(o.id)) return ['Corrected', 'old'];
  if (o.quality === 'excluded') return ['Excluded', 'excluded'];
  if (o.value === null) return ['Missing', 'missing'];
  const arr = seriesOf(S.series, o.subjectId, o.metric);
  const lv = lastValid(S.series, S.superseded, o.subjectId, o.metric);
  return lv?.id === o.id || arr.length === 0 ? ['Current', 'current'] : ['Earlier', 'earlier'];
}

function HistoryTab({ aid }: { aid: string }) {
  const e = useSim();
  const S = e.S;
  const a = astro(aid)!;
  const [metric, setMetric] = useState<Metric | 'all'>('all');
  const subjects = [aid, a.moduleId];
  const rows: Obs[] = [];
  for (const [k, arr] of S.series) {
    const [sub, m] = k.split('|');
    if (!subjects.includes(sub)) continue;
    if (metric !== 'all' && m !== metric) continue;
    rows.push(...arr.slice(-60));
  }
  rows.sort((x, y) => y.measuredAt - x.measuredAt);
  const shown = rows.slice(0, 80);
  const metrics = Object.keys(METRIC_LABEL) as Metric[];
  return (
    <div className="panel">
      <MentalHistory aid={aid} />
      <label className="field">Show
        <select value={metric} onChange={(ev) => setMetric(ev.target.value as Metric | 'all')}>
          <option value="all">All measurements (newest 80)</option>
          {metrics.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
        </select>
      </label>
      <div className="table-wrap">
        <table className="mini history">
          <thead><tr><th>Time (UTC)</th><th>Reading</th><th>Value</th><th>Status</th><th>Quality</th><th>Origin</th><th>Device · ID</th></tr></thead>
          <tbody>
            {shown.map((o) => {
              const [text, cls] = statusOf(S, o);
              return (
                <tr key={o.id}>
                  <td>{fmtDT(o.measuredAt)}</td>
                  <td>{METRIC_LABEL[o.metric]}{o.subjectId !== aid ? ` (${o.subjectId})` : ''}</td>
                  <td>{fmtValue(o.value, o.units)}</td>
                  <td><span className={`chip hs-${cls}`}>{text}</span>{o.correctionOf ? <small> corrects <code>{o.correctionOf}</code></small> : null}</td>
                  <td><QualityChip quality={o.quality} /></td>
                  <td><OriginChip origin={o.origin} /></td>
                  <td><small>{o.deviceId} · <code>{o.id}</code></small></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
