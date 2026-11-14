import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ASTRONAUTS, MODULES, astro, subjectName } from '../sim/crew';
import { fmtAge, fmtTime } from '../sim/fmt';
import { SIM } from '../sim/params';
import { lastValid, reading } from '../sim/selectors';
import { useSim } from '../sim/instance';
import type { Alert, Metric, Obs } from '../sim/types';
import { LevelBadge, NoPrompts, Provenance, StateChip } from './ui';
import { Icon, Shape } from './icons';

// reading tiles
export function ReadingTile({ label, metric, subjectId, pairWith }: { label: string; metric: Metric; subjectId: string; pairWith?: Metric }) {
  const e = useSim();
  const S = e.S;
  const r = reading(S.series, S.superseded, S.now, subjectId, metric);
  const pair = pairWith ? lastValid(S.series, S.superseded, subjectId, pairWith) : null;
  const text = r.obs ? (pairWith ? `${r.obs.value}/${pair?.value ?? '?'}` : String(r.obs.value)) : '—';
  return (
    <div className={`tile st-${r.state}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{text} <small>{r.obs && r.obs.units !== 'state' ? r.obs.units : ''}</small></div>
      <StateChip r={r} />
      {r.obs
        ? <div className="prov"><Provenance o={r.obs} now={S.now} /></div>
        : <div className="prov">No valid reading yet.</div>}
      {r.state === 'missing' && r.latest?.meta?.failure !== undefined && <div className="prov">Last attempt failed: {String(r.latest.meta.failure)}</div>}
    </div>
  );
}

// alerts
export function EvidenceList({ ids, lookup, now }: { ids: string[]; lookup: (id: string) => Obs | undefined; now: number }) {
  return (
    <ul className="evidence">
      {ids.map((id) => {
        const o = lookup(id);
        return o
          ? <li key={id}><code>{o.id}</code> {o.metric.replace('_', ' ')}: {o.value === null ? 'unavailable' : `${o.value} ${o.units}`} <Provenance o={o} now={now} /></li>
          : <li key={id}><code>{id}</code> not available at this receiver</li>;
      })}
    </ul>
  );
}

export function AlertBody({ alert, lookup, now }: { alert: Alert; lookup: (id: string) => Obs | undefined; now: number }) {
  return (
    <div className="alert-body">
      <ul className="why">{alert.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <details>
        <summary>Readings used ({alert.evidence.length})</summary>
        <EvidenceList ids={alert.evidence} lookup={lookup} now={now} />
      </details>
      <p className="placeholder-note"><b>Procedure (placeholder):</b> {alert.procedure}</p>
      <p className="placeholder-note">Demo prompt. Not a diagnosis.</p>
      {alert.groundReply && <p className="reply"><b>Ground reply</b> received {fmtTime(alert.groundReply.at)}: {alert.groundReply.text}</p>}
    </div>
  );
}

export function AlertCard({ alert }: { alert: Alert }) {
  const e = useSim();
  const S = e.S;
  const where = astro(alert.subjectId) ? '' : ' (cabin)';
  const earth = S.earthAlerts.get(alert.id);
  const rev = S.earthReview[alert.id];
  const reviewable = alert.kind === 'symptom' || alert.kind === 'help' || alert.level === 'review';
  return (
    <article className={`alert lv-${alert.level}-card`}>
      <header>
        <LevelBadge level={alert.level} />
        <h3>{alert.title}</h3>
        {alert.simulated && <span className="chip">Simulated</span>}
        <span className="muted">{subjectName(alert.subjectId)}{where} · {fmtTime(alert.createdAt)}</span>
      </header>
      {alert.contextNote && <p className="context-note">{alert.contextNote}</p>}
      <p className="status-line">
        On board: <b>{alert.onboardReview === 'none' ? 'not requested' : alert.onboardReview}</b> ·{' '}
        Earth: <b>{earth ? `received ${fmtTime(earth.receivedAt)} · ${rev?.status ?? 'received'}` : 'not yet received'}</b>
      </p>
      <details open={alert.level === 'review' || alert.level === 'help'}>
        <summary>Why?</summary>
        <AlertBody alert={alert} lookup={(id) => S.byId.get(id)} now={S.now} />
      </details>
      {reviewable && alert.status === 'open' && (
        <div className="actions">
          {alert.onboardReview === 'none' && <button onClick={() => e.setOnboardReview(alert.id, 'requested')}>Request review</button>}
          <button onClick={() => e.setOnboardReview(alert.id, 'reviewed')}>Mark reviewed</button>
        </div>
      )}
    </article>
  );
}

// cuff
const PHASE_TEXT: Record<string, string> = {
  idle: 'Ready', inflating: 'Inflating…', measuring: 'Measuring…', deflating: 'Deflating…',
  completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled',
};

export function CuffPanel({ aid }: { aid: string }) {
  const e = useSim();
  const S = e.S;
  const c = S.cuff[aid];
  const dev = S.devices[`CUFF-${aid}`];
  const busy = e.cuffBusy(aid);
  const progress = busy ? Math.min(1, (S.now - c.startedAt!) / SIM.cuff.durationMs) : c.phase === 'completed' ? 1 : 0;
  return (
    <section className="panel cuff" aria-label="Blood pressure cuff">
      <h3>Blood pressure cuff <span className="chip">Simulated</span></h3>
      <div className="cuff-row">
        <b className={`phase ph-${c.phase}`}>{PHASE_TEXT[c.phase]}</b>
        <progress value={progress} max={1} aria-label="Cuff cycle progress" />
        <span>{Math.round(progress * 100)}%</span>
      </div>
      {c.message !== 'Ready' && <p aria-live="polite">{c.message}</p>}
      <div className="actions">
        <button onClick={() => e.startCuff(aid, 'manual')} disabled={busy}>Measure now</button>
        <button onClick={() => e.cancelCuff(aid)} disabled={!busy}>Cancel</button>
      </div>
      <p className="muted">
        Next in {fmtAge(Math.max(0, c.nextScheduled - S.now))} · every {fmtAge(SIM.cuff.scheduleEveryMs)} ·
        battery {dev.battery === null ? 'n/a' : `${Math.round(dev.battery)}%`} · {dev.state}
      </p>
    </section>
  );
}

// cabin + comms
export function CabinPanel() {
  const e = useSim();
  const S = e.S;
  return (
    <section className="panel" aria-label="Cabin conditions">
      <h2>Cabin</h2>
      <table className="mini">
        <thead><tr><th>Module</th><th>CO₂ (ppm)</th><th>Temp (°C)</th><th>Humidity (% RH)</th><th>Status</th></tr></thead>
        <tbody>
          {MODULES.map((m) => {
            const co2 = reading(S.series, S.superseded, S.now, m.id, 'co2');
            const t = reading(S.series, S.superseded, S.now, m.id, 'cabin_temp');
            const rh = reading(S.series, S.superseded, S.now, m.id, 'cabin_rh');
            const al = [...S.alerts.values()].find((a) => a.kind === 'cabin' && a.subjectId === m.id && a.status === 'open');
            return (
              <tr key={m.id}>
                <th scope="row">{m.name}<small> {m.id}</small></th>
                <td>{co2.obs ? <b>{String(co2.obs.value)}</b> : '—'}<br /><StateChip r={co2} />{co2.ageMs !== null && co2.state !== 'current' && <small> {fmtAge(co2.ageMs)} old</small>}</td>
                <td>{t.obs ? String(t.obs.value) : '—'}</td>
                <td>{rh.obs ? String(rh.obs.value) : '—'}</td>
                <td>{al ? <LevelBadge level={al.level} /> : <NoPrompts />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">Simulated sensors. Limits are demo settings.</p>
    </section>
  );
}

export function delayText(ms: number) { return ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${ms / 1000} s` : `${ms / 60_000} min`; }

export function linkLabel(e: ReturnType<typeof useSim>): { word: string; cls: string; icon: ReactNode } {
  const S = e.S;
  if (!S.online) return { word: 'Offline', cls: 'link-offline', icon: <Shape n="ring" /> };
  if (!S.comms.enabled) return { word: 'Earth link down (simulated)', cls: 'link-closed', icon: <Shape n="half" /> };
  return { word: 'Earth link open', cls: 'link-open', icon: <Shape n="circle" /> };
}

export function CommsPanel() {
  const e = useSim();
  const S = e.S;
  const l = linkLabel(e);
  const oldest = S.outbox.length ? Math.min(...S.outbox.map((i) => i.enqueuedAt)) : null;
  return (
    <section className="panel" aria-label="Communication status">
      <h2>Earth link</h2>
      <p><span className={`link ${l.cls}`}>{l.icon} {l.word}</span></p>
      <ul className="facts">
        <li>Waiting to send: <b>{S.outbox.length}</b> record{S.outbox.length === 1 ? '' : 's'}{oldest !== null && ` (oldest ${fmtAge(S.now - oldest)})`}</li>
        <li>Last received on Earth: <b>{S.lastSyncAt ? `${fmtTime(S.lastSyncAt)} (${fmtAge(S.now - S.lastSyncAt)} ago)` : 'none yet'}</b></li>
        <li>One-way delay: <b>{delayText(S.comms.delayMs)}</b> (simulated)</li>
      </ul>
      {S.storageError && <p className="banner error" role="alert"><Icon n="warn" /> {S.storageError}</p>}
    </section>
  );
}

// attention list
export function AttentionList() {
  const e = useSim();
  const S = e.S;
  const alerts = [...S.alerts.values()].filter((a) => a.status === 'open').sort((a, b) => b.updatedAt - a.updatedAt);
  const devMsgs = [...S.deviceMsgs.values()].filter((m) => m.active);
  const stale: { aid: string; label: string; age: number }[] = [];
  for (const a of ASTRONAUTS) {
    for (const [m, label] of [['heart_rate', 'Pulse'], ['skin_temp', 'Skin temperature'], ['glucose', 'Glucose']] as const) {
      const r = reading(S.series, S.superseded, S.now, a.id, m);
      if (r.state === 'stale') stale.push({ aid: a.id, label, age: r.ageMs ?? 0 });
    }
    const bp = reading(S.series, S.superseded, S.now, a.id, 'bp_systolic');
    if (bp.state === 'stale') stale.push({ aid: a.id, label: 'Blood pressure', age: bp.ageMs ?? 0 });
  }
  const none = alerts.length + devMsgs.length + stale.length === 0;
  return (
    <section className="panel" aria-label="Items requiring attention">
      <h2>Needs attention</h2>
      {none && <p><NoPrompts /></p>}
      <ul className="attn">
        {alerts.map((a) => (
          <li key={a.id}>
            <LevelBadge level={a.level} />{' '}
            <Link to={astro(a.subjectId) ? `/astronaut/${a.subjectId}` : '/'}>{a.title}</Link>{' '}
            <span className="muted">· {subjectName(a.subjectId)} · {fmtTime(a.createdAt)}{(a.kind === 'help' || a.kind === 'symptom') && a.onboardReview !== 'reviewed' ? ' · unresolved' : ''}</span>
          </li>
        ))}
        {devMsgs.map((m) => (
          <li key={m.id}>
            <span className="badge dev"><Icon n="warn" /> Device</span>{' '}
            <Link to={astro(m.subjectId) ? `/astronaut/${m.subjectId}` : '/'}>{m.deviceId}</Link>{' '}
            <span className="muted">· {m.kind.replace('-', ' ')} · since {fmtTime(m.createdAt)}</span>
          </li>
        ))}
        {stale.map((s) => (
          <li key={s.aid + s.label}>
            <span className="chip st-stale"><Icon n="clock" /> Stale</span> <Link to={`/astronaut/${s.aid}`}>{s.label}</Link>{' '}
            <span className="muted">· {subjectName(s.aid)} · last valid {fmtAge(s.age)} ago</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// help
export function HelpButton({ aid, className = '', label = 'Request onboard help', ariaLabel, onHowItWorks }: { aid: string; className?: string; label?: string; ariaLabel?: string; onHowItWorks?: () => void }) {
  const e = useSim();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const close = () => { setOpen(false); setSent(null); setReason(''); };
  return (
    <>
      <button className={`help-btn ${className}`} aria-label={ariaLabel ?? label} title="Request onboard help" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className="drawer-back" onClick={close}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Request onboard help" onClick={(ev) => ev.stopPropagation()}>
            <h2>Request help</h2>
            {sent ? (
              <>
                <p className="banner ok" role="status"><Icon n="check" /> Help requested at {sent}. Queued for Earth.</p>
                <button onClick={close}>Close</button>
              </>
            ) : (
              <>
                <p>For <b>{subjectName(aid)}</b>.</p>
                <label className="field">Reason (optional)
                  <input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. feeling dizzy" />
                </label>
                <div className="actions">
                  <button className="help-btn" onClick={() => { e.requestHelp(aid, reason.trim() || undefined); setSent(fmtTime(e.S.now)); }}>Send</button>
                  <button onClick={close}>Cancel</button>
                </div>
                {onHowItWorks && <p className="fine left"><button className="linkish" onClick={() => { close(); onHowItWorks(); }}>How it works</button></p>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

