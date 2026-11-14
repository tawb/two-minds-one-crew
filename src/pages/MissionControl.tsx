import { Icon } from '../components/icons';
import { useTab } from '../components/useTab';
import Compare from './Compare';
import { AlertBody, delayText, linkLabel } from '../components/panels';
import { LevelBadge, OriginChip, QualityChip, SimBadge, StateChip, Tabs } from '../components/ui';
import { ASTRONAUTS, MODULES, subjectName } from '../sim/crew';
import { fmtAge, fmtDT, fmtTime, fmtValue } from '../sim/fmt';
import { SIM } from '../sim/params';
import { useSim } from '../sim/instance';
import { reading } from '../sim/selectors';
import { LEVEL_RANK, METRIC_LABEL, type EarthReviewStatus, type Metric } from '../sim/types';

type Tab = 'crew' | 'alerts' | 'cabin' | 'link' | 'compare';
const TABS: [Tab, string][] = [['crew', 'Crew'], ['alerts', 'Alerts'], ['cabin', 'Cabin'], ['link', 'Link'], ['compare', 'Compare']];
const TAB_IDS = TABS.map(([t]) => t);

const CREW_METRICS: [Metric, string][] = [
  ['heart_rate', 'Pulse'], ['activity', 'Activity'], ['bp_systolic', 'BP systolic'], ['bp_diastolic', 'BP diastolic'],
  ['skin_temp', 'Skin temperature'], ['glucose', 'Glucose'], ['sleep', 'Sleep'],
];

export default function MissionControl() {
  const e = useSim();
  const S = e.S;
  const [tab, setTab] = useTab<Tab>(TAB_IDS, 'crew');
  const l = linkLabel(e);
  const surgeon = S.mcRole === 'surgeon';
  const waiting = S.outbox.length;
  const unreviewed = [...S.earthAlerts.values()].filter((x) => x.alert.status !== 'cleared' && S.earthReview[x.alert.id]?.status !== 'reviewed' && x.alert.level !== 'logged').length;
  return (
    <section>
      <div className="page-head">
        <div>
          <h1 className="hero">Earth <SimBadge>Simulated</SimBadge></h1>
        </div>
        <div className="head-actions" role="group" aria-label="Simulated role">
          <span className="muted">View as</span>
          <button className={surgeon ? 'on' : ''} aria-pressed={surgeon} onClick={() => e.setMcRole('surgeon')}>Flight surgeon</button>
          <button className={!surgeon ? 'on' : ''} aria-pressed={!surgeon} onClick={() => e.setMcRole('ops')}>Ground ops</button>
        </div>
      </div>
      <div className="summary">
        <div><span className={`link ${l.cls}`}>{l.icon} {l.word}</span></div>
        <div>Last received <b>{S.lastSyncAt ? `${fmtTime(S.lastSyncAt)} · ${fmtAge(S.now - S.lastSyncAt)} ago` : 'none'}</b></div>
        <div>Waiting <b>{waiting}</b></div>
        <div>To review <b>{unreviewed}</b></div>
        <div>Delay <b>{delayText(S.comms.delayMs)}</b></div>
      </div>
      {!surgeon && <p className="banner info">Ground ops view. Symptoms and well-being are visible to the flight surgeon only (simulated policy).</p>}
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Mission Control sections" />
      {tab === 'crew' && <CrewData />}
      {tab === 'alerts' && <Alerts />}
      {tab === 'cabin' && <Cabin />}
      {tab === 'link' && <Link_ />}
      {tab === 'compare' && <div className="embedded"><Compare embedded /></div>}
    </section>
  );
}

function recvCells(S: ReturnType<typeof useSim>['S'], id: string | undefined, measured: number) {
  const er = id ? S.earth.get(id) : undefined;
  if (!er) return { received: '—', delay: '—', delayed: false };
  const d = er.receivedAt - measured;
  return { received: fmtTime(er.receivedAt), delay: fmtAge(d), delayed: d > SIM.thresholds.delayedDataMs };
}

function CrewData() {
  const e = useSim();
  const S = e.S;
  const surgeon = S.mcRole === 'surgeon';
  return (
    <div>
      {ASTRONAUTS.map((a) => {
        const devs = [...S.earthDevMsgs.values()].filter((x) => x.msg.active && x.msg.subjectId === a.id);
        return (
          <details key={a.id} className="panel" open={a.id === 'A1' || devs.length > 0}>
            <summary><h2>{a.name} <small className="muted">{a.role} · {a.moduleId}</small></h2></summary>
            {devs.map((d) => <p key={d.msg.id} className="banner warn"><Icon n="warn" /> Device status (received {fmtTime(d.receivedAt)}): {d.msg.text}</p>)}
            <div className="table-wrap">
              <table className="mini">
                <thead><tr><th>Reading</th><th>Value</th><th>Measured</th><th>Received</th><th>Transit</th><th>Age</th><th>State</th><th>Quality · origin</th></tr></thead>
                <tbody>
                  {CREW_METRICS.map(([m, label]) => {
                    const r = reading(S.earthSeries, S.earthSuperseded, S.now, a.id, m);
                    const c = r.obs ? recvCells(S, r.obs.id, r.obs.measuredAt) : null;
                    return (
                      <tr key={m}>
                        <th scope="row">{label}</th>
                        <td>{r.obs ? fmtValue(r.obs.value, r.obs.units) : 'none'}</td>
                        <td>{r.obs ? fmtDT(r.obs.measuredAt) : '—'}</td>
                        <td>{c?.received ?? '—'}</td>
                        <td>{c ? <>{c.delay}{c.delayed && <span className="chip st-stale"> <Icon n="clock" /> Delayed</span>}</> : '—'}</td>
                        <td>{r.ageMs !== null ? fmtAge(r.ageMs) : '—'}</td>
                        <td><StateChip r={r} /></td>
                        <td>{r.obs && <><QualityChip quality={r.obs.quality} /> <OriginChip origin={r.obs.origin} /></>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>Well-being <span className="chip">Sensitive</span></h3>
            {surgeon ? (
              <p>
                {(['mood', 'stress', 'fatigue'] as const).map((m) => {
                  const r = reading(S.earthSeries, S.earthSuperseded, S.now, a.id, m);
                  return <span key={m} className="wb">{METRIC_LABEL[m]}: <b>{r.obs ? `${r.obs.value}/5` : '—'}</b></span>;
                })}
                <OriginChip origin="simulated-self-report" />
              </p>
            ) : <p className="muted"><Icon n="lock" /> Flight surgeon only.</p>}
          </details>
        );
      })}
    </div>
  );
}

function Alerts() {
  const e = useSim();
  const S = e.S;
  const surgeon = S.mcRole === 'surgeon';
  const items = [...S.earthAlerts.values()].sort((x, y) => LEVEL_RANK[y.alert.level] - LEVEL_RANK[x.alert.level] || y.receivedAt - x.receivedAt).slice(0, 60);
  const lookup = (id: string) => S.earth.get(id)?.rec.obs;
  const setRev = (id: string, st: EarthReviewStatus) => e.earthSetReview(id, st);
  if (items.length === 0) return <p className="panel">No alerts received yet.</p>;
  return (
    <div>
      {items.map(({ alert: a, receivedAt }) => {
        const rev = S.earthReview[a.id];
        const restricted = !surgeon && (a.kind === 'symptom' || a.kind === 'help');
        const reviewable = a.level !== 'logged';
        return (
          <article key={a.id} className={`alert lv-${a.level}-card`}>
            <header>
              <LevelBadge level={a.level} />
              <h3>{restricted ? (a.kind === 'help' ? 'Help requested' : 'Symptom report received') : a.title}</h3>
              <span className="muted">{subjectName(a.subjectId)}</span>
            </header>
            <p className="status-line">
              Sent <b>{fmtDT(a.updatedAt)}</b> · received <b>{fmtTime(receivedAt)}</b> ({fmtAge(receivedAt - a.updatedAt)}) · <b>{a.status}</b> · review <b>{rev?.status ?? 'received'}</b>
            </p>
            {restricted ? <p className="banner info"><Icon n="lock" /> Details: flight surgeon only (simulated policy).</p> : (
              <details open={a.level === 'review' || a.level === 'help'}>
                <summary>Details</summary>
                {a.contextNote && <p className="context-note">{a.contextNote}</p>}
                <AlertBody alert={a} lookup={lookup} now={S.now} />
              </details>
            )}
            {surgeon && reviewable && (
              <div className="actions">
                <button disabled={rev?.status === 'under-review'} onClick={() => setRev(a.id, 'under-review')}>Under review</button>
                <button disabled={rev?.status === 'reviewed'} onClick={() => setRev(a.id, 'reviewed')}>Reviewed</button>
                {(a.kind === 'symptom' || a.kind === 'help') && !a.groundReply && !S.downlink.some((d) => d.alertId === a.id) && (
                  <button onClick={() => e.groundReply(a.id, 'Received. Rest and re-check in 30 minutes. (Simulated reply, not medical advice.)')}>
                    Send reply (simulated)
                  </button>
                )}
              </div>
            )}
            {S.downlink.some((d) => d.alertId === a.id) && <p className="muted">Reply on its way…</p>}
            {a.groundReply && <p className="muted">Reply delivered {fmtTime(a.groundReply.at)}</p>}
          </article>
        );
      })}
    </div>
  );
}

function Cabin() {
  const e = useSim();
  const S = e.S;
  return (
    <div className="panel">
      <h2>Cabin</h2>
      <div className="table-wrap">
        <table className="mini">
          <thead><tr><th>Module</th><th>Reading</th><th>Value</th><th>Measured</th><th>Received</th><th>State</th></tr></thead>
          <tbody>
            {MODULES.flatMap((m) => (['co2', 'cabin_temp', 'cabin_rh'] as Metric[]).map((metric) => {
              const r = reading(S.earthSeries, S.earthSuperseded, S.now, m.id, metric);
              const c = r.obs ? recvCells(S, r.obs.id, r.obs.measuredAt) : null;
              return (
                <tr key={m.id + metric}>
                  <th scope="row">{m.name} <small>{m.id}</small></th>
                  <td>{METRIC_LABEL[metric]}</td>
                  <td>{r.obs ? fmtValue(r.obs.value, r.obs.units) : 'none'}</td>
                  <td>{r.obs ? fmtDT(r.obs.measuredAt) : '—'}</td>
                  <td>{c?.received ?? '—'}</td>
                  <td><StateChip r={r} />{r.ageMs !== null && r.state !== 'current' && <small> {fmtAge(r.ageMs)} old</small>}</td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Link_() {
  const e = useSim();
  const S = e.S;
  const pending = S.outbox.slice(0, 30);
  const byKind = (k: string) => S.outbox.filter((i) => i.rec.kind === k).length;
  return (
    <div>
      <div className="panel">
        <h2>Link status</h2>
        <ul className="facts">
          <li>On Earth: <b>{S.earth.size}</b> records</li>
          <li>Waiting: <b>{S.outbox.length}</b> (readings {byKind('obs')}, alerts {byKind('alert')}, devices {byKind('device')})</li>
          <li>Last acknowledged: <b>{S.lastAckAt ? fmtDT(S.lastAckAt) : 'none'}</b></li>
          <li>Duplicates rejected: <b>{S.dupRejected}</b></li>
          <li>Saved on board first, then sent, retried, acknowledged.</li>
        </ul>
        {S.storageError && <p className="banner error" role="alert"><Icon n="warn" /> {S.storageError}</p>}
      </div>
      <div className="panel">
        <h2>Waiting to send</h2>
        {pending.length === 0 ? <p className="muted">Nothing waiting.</p> : (
          <div className="table-wrap">
            <table className="mini">
              <thead><tr><th>ID</th><th>Type</th><th>Who</th><th>Time</th><th>Tries</th><th>State</th></tr></thead>
              <tbody>
                {pending.map((i) => (
                  <tr key={i.rec.id}>
                    <td><code>{i.rec.id}</code></td><td>{i.rec.kind}</td><td>{subjectName(i.rec.subjectId)}</td>
                    <td>{fmtDT(i.rec.at)}</td><td>{i.attempts}</td>
                    <td>{i.sentAt === undefined ? 'Waiting' : i.attemptDelivered ? 'Delivered' : 'In transit'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
