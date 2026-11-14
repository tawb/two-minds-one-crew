import { Link } from 'react-router-dom';
import { AttentionList } from '../components/panels';
import { Icon } from '../components/icons';
import { LevelBadge, NoPrompts } from '../components/ui';
import { ASTRONAUTS, moduleOf, type Astronaut } from '../sim/crew';
import { useSim } from '../sim/instance';
import { reading } from '../sim/selectors';
import { LEVEL_RANK, type Metric } from '../sim/types';

function Compact({ a, metric, label, pair }: { a: Astronaut; metric: Metric; label: string; pair?: Metric }) {
  const e = useSim();
  const S = e.S;
  const r = reading(S.series, S.superseded, S.now, a.id, metric);
  const p = pair ? reading(S.series, S.superseded, S.now, a.id, pair) : null;
  const text = r.obs ? (pair ? `${r.obs.value}/${p?.obs?.value ?? '?'}` : String(r.obs.value)) : '—';
  const flag = r.state === 'current' ? null : r.state === 'stale' ? <><Icon n="clock" /> stale</> : r.state === 'missing' ? <><Icon n="warn" /> no signal</> : 'no data';
  return (
    <div className={`kv st-${r.state}`}>
      <span className="kv-l">{label}</span>
      <span className="kv-v">{text}<small> {r.obs && r.obs.units !== 'state' ? r.obs.units : ''}</small></span>
      <span className="kv-f">{flag}</span>
    </div>
  );
}

function CrewCard({ a }: { a: Astronaut }) {
  const e = useSim();
  const S = e.S;
  const mod = moduleOf(a.moduleId)!;
  const open = [...S.alerts.values()].filter((x) => x.subjectId === a.id && x.status === 'open');
  const worst = open.sort((x, y) => LEVEL_RANK[y.level] - LEVEL_RANK[x.level])[0];
  return (
    <Link to={`/astronaut/${a.id}`} className="card crew-card" aria-label={`${a.name}, open details`}>
      <header>
        <div>
          <h3>{a.name}</h3>
          <p className="muted">{a.role} · {mod.id}</p>
        </div>
        {worst ? <LevelBadge level={worst.level} /> : <NoPrompts />}
      </header>
      <div className="kvs">
        <Compact a={a} metric="heart_rate" label="Pulse" />
        <Compact a={a} metric="bp_systolic" pair="bp_diastolic" label="Blood pressure" />
        <Compact a={a} metric="skin_temp" label="Skin temp" />
        <Compact a={a} metric="glucose" label="Glucose" />
      </div>
    </Link>
  );
}

export default function Overview() {
  return (
    <section>
      <h1 className="hero">Crew</h1>
      <div className="overview">
        <div className="crew-grid">{ASTRONAUTS.map((a) => <CrewCard key={a.id} a={a} />)}</div>
        <div className="side">
          <AttentionList />
        </div>
      </div>
    </section>
  );
}
