import { useState } from 'react';
import { useSim } from '../sim/instance';
import { LEVEL_LABEL, type Alert } from '../sim/types';
import { REGIONS, type RegionId } from '../sim/vitals';

/** Report an issue with a body part: pick, rate, send. A note is optional. */
export default function ReportSheet({ aid, region, onClose }: { aid: string; region: RegionId; onClose: () => void }) {
  const e = useSim();
  const def = REGIONS[region];
  const [symptom, setSymptom] = useState<string>('');
  const [other, setOther] = useState('');
  const [sev, setSev] = useState(2);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<Alert | null>(null);
  const name = symptom === 'Other' ? other.trim() : symptom;

  const send = () => {
    if (!name) return;
    const o = e.reportSymptom(aid, { symptom: name, severity: sev, onsetAt: e.S.now, note: note.trim() || undefined, origin: 'manual', region });
    setSent([...e.S.alerts.values()].find((a) => a.evidence[0] === o.id) ?? null);
  };

  return (
    <div className="sheet-back" role="dialog" aria-modal="true" aria-label={`Report a problem: ${def.label}`} onClick={onClose}>
      <div className="sheet wide" onClick={(ev) => ev.stopPropagation()}>
        {sent ? (
          <>
            <h2>Reported</h2>
            <p className="sub">{def.label} · {name}</p>
            <p><span className={`pill pill-${sent.level === 'logged' ? 'ok' : 'warn'}`}>{LEVEL_LABEL[sent.level]}</span></p>
            {sent.contextNote && <p className="note">{sent.contextNote}</p>}
            <p className="fine">Saved. Goes to Earth when the link is open.</p>
            <button className="btn-primary" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <h2>Report a problem</h2>
            <p className="sub">{def.label}</p>
            <div className="chips" role="group" aria-label="What is wrong?">
              {[...def.symptoms, 'Other'].map((s) => (
                <button key={s} className={`chipbtn ${symptom === s ? 'on' : ''}`} aria-pressed={symptom === s} onClick={() => setSymptom(s)}>{s}</button>
              ))}
            </div>
            {symptom === 'Other' && <input className="textin" placeholder="Describe it" value={other} onChange={(ev) => setOther(ev.target.value)} />}
            <p className="label">How strong?</p>
            <div className="seg" role="group" aria-label="Severity">
              {[1, 2, 3, 4, 5].map((n) => <button key={n} className={sev === n ? 'on' : ''} aria-pressed={sev === n} onClick={() => setSev(n)}>{n}</button>)}
            </div>
            <input className="textin" placeholder="Note (optional)" value={note} onChange={(ev) => setNote(ev.target.value)} />
            <div className="row-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={!name} onClick={send}>Send</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
