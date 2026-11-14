import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Tabs } from '../components/ui';
import { useTab } from '../components/useTab';
import Astronaut from './Astronaut';
import Glucose from './Glucose';
import Sleep from './Sleep';
import { Icon, Shape, VitalIcon } from '../components/icons';
import BaselineNote from '../components/BaselineNote';
import ContextPanel from '../components/ContextPanel';
import ProtectFitness from '../components/ProtectFitness';
import WhatToDo from '../components/WhatToDo';
import MeasureSheet from '../components/MeasureSheet';
import { astro } from '../sim/crew';
import { fmtAge, fmtHM, fmtTime } from '../sim/fmt';
import { useSim } from '../sim/instance';
import { change, vitals, type Vital } from '../sim/vitals';
import { Delta } from './Compare';

export function FlagChip({ v }: { v: Vital }) {
  if (v.state === 'none') return <span className="pill pill-none">No data</span>;
  if (v.state === 'missing') return <span className="pill pill-bad"><Icon n="warn" /> No signal</span>;
  if (v.state === 'stale') return <span className="pill pill-warn"><Icon n="clock" /> {fmtAge(v.ageMs ?? 0)} old</span>;
  if (v.flag === 'review') return <span className="pill pill-review"><Shape n="diamond" /> Review</span>;
  if (v.flag === 'verify') return <span className="pill pill-warn"><Shape n="triangle" /> Check</span>;
  return <span className="pill pill-ok" title="Within the simulation range"><Icon n="check" /> In range</span>;
}

const TIPPED = ['pulse', 'bp', 'glucose', 'temp', 'sleep'];

function Card({ v, aid }: { v: Vital; aid: string }) {
  const S = useSim().S;
  const ch = change(S, aid, v.key);
  const bpm = v.key === 'pulse' && v.value ? Number(v.value) : 0;
  return (
    <Link to={`/part/${v.region}`} className={`vcard vc-${v.key} ${v.state === 'missing' || v.state === 'stale' ? 'vc-dim' : ''}`} aria-label={`${v.label}: ${v.value ?? 'no data'} ${v.unit}`}>
      <span className="vicon" style={bpm ? { animationDuration: `${60 / Math.max(40, Math.min(180, bpm))}s` } : undefined}><VitalIcon k={v.key} /></span>
      <span className="vlabel">{v.label}</span>
      <span className="vvalue">{v.value ?? '—'}<small>{v.value ? v.unit : ''}</small></span>
      {(!TIPPED.includes(v.key) || v.state !== 'current') && <FlagChip v={v} />}
      {TIPPED.includes(v.key) && v.state === 'current' && <BaselineNote aid={aid} obs={v.obs} bp={v.key === 'bp'} compact />}
      {v.value && <span className="cardchange"><Delta d={ch.delta} />{ch.prevAt ? <> since {fmtHM(ch.prevAt)}</> : null}</span>}
    </Link>
  );
}

type VTab = 'overview' | 'sleep' | 'glucose' | 'history';
const VTABS: [VTab, string][] = [['overview', 'Overview'], ['sleep', 'Sleep'], ['glucose', 'Glucose'], ['history', 'History']];

export default function Vitals() {
  const e = useSim();
  const S = e.S;
  const nav = useNavigate();
  const a = astro(S.viewerId)!;
  const [measuring, setMeasuring] = useState(false);
  const [tab, setTab] = useTab<VTab>(VTABS.map(([t]) => t), 'overview');
  const last = S.lastMeasure[a.id];
  return (
    <section className="vitals">
      <div className="vhead">
        <div>
          <h1 className="hero">Vitals</h1>
          {last && <p className="sub">Measured at {fmtTime(last)}</p>}
        </div>
        <div className="vactions">
          <button className="btn-secondary" onClick={() => setMeasuring(true)}>Measure again</button>
          <button className="btn-primary" onClick={() => nav('/home')}>Done</button>
        </div>
      </div>
      <Tabs tabs={VTABS} value={tab} onChange={setTab} label="Vitals sections" />
      {tab === 'overview' && <>
        <WhatToDo aid={a.id} />
        <ContextPanel aid={a.id} />
        <div className="vgrid">{vitals(S, a.id).map((v) => <Card key={v.key} v={v} aid={a.id} />)}</div>
        <ProtectFitness aid={a.id} />
      </>}
      {tab === 'sleep' && <div className="embedded"><Sleep /></div>}
      {tab === 'glucose' && <div className="embedded"><Glucose /></div>}
      {tab === 'history' && <div className="embedded"><Astronaut id={a.id} embedded initialTab="history" /></div>}
      {measuring && <MeasureSheet aid={a.id} onCancel={() => setMeasuring(false)} onDone={() => setMeasuring(false)} />}
    </section>
  );
}
