import { useMemo, useState } from 'react';
import { addSession, allSessions, loadLogged } from '../exercise/log';
import { assess, DOSE, maxHr, NORMAL, PROTECT, RULES, rule, WEEKLY_TARGET, ZONE, zoneBpm, type ExerciseSession } from '../exercise/rules';
import { astro } from '../sim/crew';
import { useSim } from '../sim/instance';

const ARED = ['Squat', 'Deadlift', 'Heel raise', 'Bench press'];
const pctText = (p: number | null) => (p === null ? 'no baseline yet' : `${Math.round(p)}% of baseline`);

function Bar({ value, target }: { value: number; target: number }) {
  const w = Math.min(100, (value / target) * 100);
  return <div className="pf-bar" role="img" aria-label={`${Math.round(value)} of ${target} minutes`}><span className={value >= target ? 'ok' : ''} style={{ width: `${w}%` }} /></div>;
}

function SourceLink({ id }: { id: string }) {
  const r = rule(id);
  return r.source
    ? <a className="pf-src" href={r.source.url} target="_blank" rel="noreferrer" title={r.source.quote ?? r.source.note}>Source</a>
    : <span className="pf-review">needs review</span>;
}

/** Weekly training against NASA OCHMO-TB-031 targets, as a proxy from minutes and logged lifts. */
export default function ProtectFitness({ aid }: { aid: string }) {
  const S = useSim().S;
  const a = astro(aid)!;
  const [tick, setTick] = useState(0);
  const sessions = useMemo(() => allSessions(aid, a.age, S.now), [aid, a.age, S.now, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = assess(sessions, S.now, a.age);
  const [lo, hi] = zoneBpm(a.age);
  const [kind, setKind] = useState<'aerobic' | 'resistance'>('aerobic');
  const [minutes, setMinutes] = useState('30');
  const [hr, setHr] = useState('');
  const [lift, setLift] = useState({ exercise: ARED[0], loadKg: '', sets: '3', reps: '10' });
  const [msg, setMsg] = useState('');

  const save = () => {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) { setMsg('Enter the minutes.'); return; }
    const s: ExerciseSession = { id: `LOG-${Date.now()}`, subjectId: aid, at: S.now, kind, minutes: m };
    if (kind === 'aerobic' && hr.trim() !== '' && Number.isFinite(Number(hr))) s.avgHr = Number(hr);
    if (kind === 'resistance' && lift.loadKg.trim() !== '' && Number(lift.loadKg) > 0) s.lifts = [{ exercise: lift.exercise, loadKg: Number(lift.loadKg), sets: Number(lift.sets) || 1, reps: Number(lift.reps) || 1 }];
    addSession(s);
    setTick((t) => t + 1);
    setMsg('Saved.');
  };

  const high = r.risk === 'high';
  return (
    <section className="pf" aria-label="Protect your fitness">
      <div className="pf-head">
        <h2>Protect your fitness</h2>
        <span className="chip origin-simulated">Simulated</span>
      </div>
      <p className="pf-proxy">proxy, not a VO2 or strength test</p>

      {high && (
        <p className="banner error" role="alert">
          High risk: {r.atRisk.map((x) => `${x === 'aerobic' ? 'aerobic' : 'strength'} ${Math.round((x === 'aerobic' ? r.aerobicPct : r.strengthPct) ?? 0)}% of baseline`).join(', ')}. {rule('safety-gate-wording').text} <span className="pf-review">needs review</span>
          <br />{rule('never-zero-volume').text} <span className="pf-review">needs review</span>
        </p>
      )}
      {!high && r.belowMinimumDose && <p className="banner warn">Below the minimum dose this week: {r.week.qualifying} of {DOSE.sessions} sessions over {DOSE.minutesMoreThan} min above {DOSE.hrPctMoreThan}% max HR.</p>}
      {r.volumeZero && <p className="banner warn">No resistance logged this week. {rule('never-zero-volume').text}</p>}

      <div className="pf-grid">
        <div className="pf-row">
          <div className="pf-top"><span>Aerobic this week</span><b>{Math.round(r.week.aerobicMin)} / {WEEKLY_TARGET.aerobic} min</b></div>
          <Bar value={r.week.aerobicMin} target={WEEKLY_TARGET.aerobic} />
          <small>Target: {NORMAL.sessions[0]} sessions x {NORMAL.aerobicMin} min <SourceLink id="normal-week" /></small>
        </div>
        <div className="pf-row">
          <div className="pf-top"><span>Resistance this week</span><b>{Math.round(r.week.resistanceMin)} / {WEEKLY_TARGET.resistance[0]} to {WEEKLY_TARGET.resistance[1]} min</b></div>
          <Bar value={r.week.resistanceMin} target={WEEKLY_TARGET.resistance[0]} />
          <small>{NORMAL.resistanceMin[0]} to {NORMAL.resistanceMin[1]} min per session, {NORMAL.sessions[0]} to {NORMAL.sessions[1]} sessions <SourceLink id="normal-week" /></small>
        </div>
        <div className="pf-row">
          <div className="pf-top"><span>Aerobic, proxy</span><b className={`pf-${r.atRisk.includes('aerobic') ? 'bad' : r.aerobicPct === null ? 'none' : 'ok'}`}>{pctText(r.aerobicPct)}</b></div>
          <small>Aerobic minutes vs baseline. Keep at {PROTECT.aerobic}% or more <SourceLink id="protect-aerobic" /></small>
        </div>
        <div className="pf-row">
          <div className="pf-top"><span>Strength, proxy</span><b className={`pf-${r.atRisk.includes('strength') ? 'bad' : r.strengthPct === null ? 'none' : 'ok'}`}>{pctText(r.strengthPct)}</b></div>
          <small>
            {r.minutesPct !== null && <>Resistance minutes {Math.round(r.minutesPct)}%, logged lifts {r.liftsPct === null ? 'n/a' : `${Math.round(r.liftsPct)}%`}. </>}
            Keep at {PROTECT.strength}% or more <SourceLink id="protect-strength" />
          </small>
        </div>
        <div className="pf-row">
          <div className="pf-top"><span>Minimum dose</span><b className={`pf-${r.belowMinimumDose ? 'warn' : 'ok'}`}>{r.week.qualifying} of {DOSE.sessions} sessions</b></div>
          <small>{DOSE.sessions}+ sessions a week, over {DOSE.minutesMoreThan} min, above {DOSE.hrPctMoreThan}% max HR <SourceLink id="minimum-dose" /></small>
        </div>
        <div className="pf-row">
          <div className="pf-top"><span>Aerobic zone</span><b>{lo} to {hi} bpm</b></div>
          <small>{ZONE.minPct} to {ZONE.maxPct}% of max HR ({maxHr(a.age)} bpm estimated, <span className="pf-review">needs review</span>) <SourceLink id="aerobic-intensity" /></small>
        </div>
        <div className="pf-row">
          <div className="pf-top"><span>Bone</span><b className="pf-none">not measured here</b></div>
          <small>Target {PROTECT.bone}% of baseline. This device cannot measure it <SourceLink id="protect-bone" /></small>
        </div>
      </div>

      <details className="pf-details">
        <summary>Rules and sources</summary>
        <ul className="plain">
          {RULES.map((x) => (
            <li key={x.id}>
              <b>{x.label}.</b> {x.text} {x.source ? <a className="pf-src" href={x.source.url} target="_blank" rel="noreferrer" title={x.source.quote ?? x.source.note}>Source</a> : null}
              {x.needsReview && <span className="pf-review">needs review</span>}
            </li>
          ))}
        </ul>
      </details>

      <details className="pf-details">
        <summary>Log a session</summary>
        <div className="ctxgrid">
          <label>Type
            <select value={kind} onChange={(ev) => setKind(ev.target.value as 'aerobic' | 'resistance')}>
              <option value="aerobic">Aerobic</option><option value="resistance">Resistance</option>
            </select>
          </label>
          <label>Minutes<input type="number" min={1} value={minutes} onChange={(ev) => setMinutes(ev.target.value)} /></label>
          {kind === 'aerobic' && <label>Average heart rate, bpm (optional)<input type="number" min={30} value={hr} onChange={(ev) => setHr(ev.target.value)} /></label>}
          {kind === 'resistance' && (
            <>
              <label>Exercise
                <select value={lift.exercise} onChange={(ev) => setLift({ ...lift, exercise: ev.target.value })}>{ARED.map((x) => <option key={x}>{x}</option>)}</select>
              </label>
              <label>Load, kg (optional)<input type="number" min={0} value={lift.loadKg} onChange={(ev) => setLift({ ...lift, loadKg: ev.target.value })} /></label>
              <label>Sets<input type="number" min={1} value={lift.sets} onChange={(ev) => setLift({ ...lift, sets: ev.target.value })} /></label>
              <label>Reps<input type="number" min={1} value={lift.reps} onChange={(ev) => setLift({ ...lift, reps: ev.target.value })} /></label>
            </>
          )}
        </div>
        <div className="actions"><button className="btn-secondary" onClick={save}>Save session</button>{msg && <span className="muted" role="status">{msg}</span>}</div>
        <p className="fine left">{loadLogged().filter((s) => s.subjectId === aid).length} of your own sessions saved on this device.</p>
      </details>
    </section>
  );
}
