import { useNavigate } from 'react-router-dom';
import { Icon, VitalIcon } from '../components/icons';
import { astro } from '../sim/crew';
import { fmtAge, fmtHM } from '../sim/fmt';
import { useSim } from '../sim/instance';
import { compareAll, type Comparison, type Side } from '../sim/vitals';

export function Delta({ d, unit }: { d: number | null; unit?: string }) {
  if (d === null) return <span className="delta">first reading</span>;
  if (d === 0) return <span className="delta">no change</span>;
  return <span className="delta"><Icon n={d > 0 ? 'up' : 'down'} /> {Math.abs(d)}{unit ? ` ${unit}` : ''}</span>;
}

function Block({ title, s, unit, empty }: { title: string; s: Side; unit: string; empty: string }) {
  return (
    <div className="cblock">
      <div className="ctitle">{title}</div>
      {s.now === null ? <p className="muted">{empty}</p> : (
        <>
          <div className="cnow">{s.now}<small>{unit}</small></div>
          <div className="csub">{fmtHM(s.nowAt!)}</div>
          <div className="cprev">
            {s.prev !== null ? <>Before: <b>{s.prev}</b> <span className="csub">({fmtHM(s.prevAt!)})</span></> : 'No earlier reading'}
            {s.prev !== null && <> · <Delta d={s.delta} /></>}
          </div>
        </>
      )}
    </div>
  );
}

function Row({ c, now }: { c: Comparison; now: number }) {
  return (
    <div className="ccard">
      <div className="chead">
        <span className={`vicon sm vc-${c.key}`}><VitalIcon k={c.key} size={22} /></span>
        <h2>{c.label}</h2>
        {c.board.now !== null && (() => {
          const d = c.board.delta;
          const w = d === null || d === 0 ? 'Normal' : d > 0 ? 'Higher' : 'Lower';
          return <span className={`pill ${w === 'Normal' ? 'pill-ok' : 'pill-warn'}`}>{w}</span>;
        })()}
      </div>
      <div className="ccols">
        <Block title="On board" s={c.board} unit={c.unit} empty="No reading yet" />
        <Block title="On Earth" s={c.earth} unit={c.unit} empty="Nothing received yet" />
      </div>
      {c.earthReceivedAt !== null && <p className="fine left">Earth last received {fmtHM(c.earthReceivedAt)} · {fmtAge(now - c.earthReceivedAt)} ago</p>}
    </div>
  );
}

export default function Compare({ embedded = false }: { embedded?: boolean }) {
  const e = useSim();
  const S = e.S;
  const nav = useNavigate();
  const a = astro(S.viewerId)!;
  const rows = compareAll(S, a.id);
  return (
    <section className="compare">
      {!embedded && <button className="back" onClick={() => nav(-1)} aria-label="Back"><Icon n="left" /> Back</button>}
      {!embedded && <h1 className="hero">Compare</h1>}
      <div className="clist">{rows.map((c) => <Row key={c.key} c={c} now={S.now} />)}</div>
    </section>
  );
}
