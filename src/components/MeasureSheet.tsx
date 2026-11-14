import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { astro, moduleOf } from '../sim/crew';
import { useSim } from '../sim/instance';

const STEP_MS = 950;

/** Shows each (simulated) sensor being read, then takes the measurement and calls onDone. */
export default function MeasureSheet({ aid, onDone, onCancel }: { aid: string; onDone: () => void; onCancel: () => void }) {
  const e = useSim();
  const S = e.S;
  const a = astro(aid)!;
  const steps = [
    { label: 'Wrist band', detail: 'Heart rate · temperature', dev: `BAND-${aid}` },
    { label: 'Upper-arm cuff', detail: 'Blood pressure', dev: `CUFF-${aid}` },
    { label: 'Glucose patch', detail: 'Glucose', dev: `CGM-${aid}` },
    { label: 'Cabin sensor', detail: 'Air quality', dev: moduleOf(a.moduleId)!.sensorId },
  ];
  const [done, setDone] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach((_, i) => timers.push(setTimeout(() => setDone(i + 1), STEP_MS * (i + 1))));
    timers.push(setTimeout(() => { e.measureNow(aid); }, STEP_MS * steps.length + 150));
    timers.push(setTimeout(onDone, STEP_MS * steps.length + 900));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sheet-back" role="dialog" aria-modal="true" aria-label="Measuring vitals">
      <div className="sheet">
        <h2>Measuring…</h2>
        <p className="sub">Simulated sensors</p>
        <ul className="steps">
          {steps.map((s, i) => {
            const state = i < done ? (S.devices[s.dev].state === 'ok' ? 'ok' : 'bad') : i === done ? 'run' : 'wait';
            return (
              <li key={s.dev} className={`step step-${state}`}>
                <span className="step-icon" aria-hidden="true">{state === 'ok' ? <Icon n="check" /> : state === 'bad' ? '!' : state === 'run' ? <i className="spin" /> : ''}</span>
                <span><b>{s.label}</b><small>{state === 'bad' ? 'No signal' : s.detail}</small></span>
              </li>
            );
          })}
        </ul>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
