import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BodyMap, { type RegionFlags } from '../components/BodyMap';
import MeasureSheet from '../components/MeasureSheet';
import { Icon } from '../components/icons';
import { astro } from '../sim/crew';
import { fmtTime } from '../sim/fmt';
import { useSim } from '../sim/instance';
import { REGIONS, regionFlag, worse, type RegionId } from '../sim/vitals';
import { cvFlag, useCvStatus } from '../features/cv-response-check/cvStatus';

export default function Home() {
  const e = useSim();
  const S = e.S;
  const nav = useNavigate();
  const a = astro(S.viewerId)!;
  const [hover, setHover] = useState<RegionId | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const flags = Object.fromEntries((Object.keys(REGIONS) as RegionId[]).map((r) => [r, regionFlag(S, a.id, r)])) as RegionFlags;
  const last = S.lastMeasure[a.id];
  // Response check (camera): a recent "watch" or "check-in suggested" result also marks the head.
  const cvF = cvFlag(useCvStatus(a.id));
  if (cvF !== 'ok') flags.head = { ...flags.head, flag: worse(flags.head.flag, cvF) };

  return (
    <section className="home">
      <div className="home-copy">
        <h1 className="hero">Hello,<br />{a.name.split(' ')[0]}</h1>
        <button className="btn-primary big" onClick={() => setMeasuring(true)}>Measure vitals <Icon n="right" /></button>
        <p className="caption">{last ? `Last measured ${fmtTime(last)}` : 'Not measured yet'}</p>
      </div>
      <div className="home-body">
        <div className="body-wrap">
          <BodyMap flags={flags} onSelect={(r) => nav(`/part/${r}`)} onHover={setHover} />
        </div>
        <p className="caption center" aria-live="polite">{hover ? REGIONS[hover].label : '\u00a0'}</p>
      </div>
      {measuring && <MeasureSheet aid={a.id} onCancel={() => setMeasuring(false)} onDone={() => nav('/vitals')} />}
    </section>
  );
}
