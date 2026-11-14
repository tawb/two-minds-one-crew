import { useState } from 'react';
import { Icon, type IconName } from './icons';

const STEPS: { title: string; text: string; icon: IconName }[] = [
  { icon: 'check', title: 'Welcome', text: 'Practice data only. Nothing here is real or medical advice.' },
  { icon: 'wave', title: 'Measure', text: 'One tap reads all your sensors.' },
  { icon: 'body', title: 'Body map', text: 'Tap a body part to see its readings or report a problem.' },
  { icon: 'help', title: 'Help', text: 'The Help button is always at the top. It also opens this tour. Your initials open the menu.' },
];

export default function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <div className="sheet-back" role="dialog" aria-modal="true" aria-label="How it works">
      <div className="sheet tour">
        <div className="tour-icon" aria-hidden="true"><Icon n={s.icon} size={34} /></div>
        <h2>{s.title}</h2>
        <p className="tour-text">{s.text}</p>
        <div className="dots" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
          {STEPS.map((_, n) => <span key={n} className={n === i ? 'dot on' : 'dot'} />)}
        </div>
        <div className="row-actions spread">
          {i > 0 ? <button className="btn-secondary" onClick={() => setI(i - 1)}>Back</button> : <button onClick={onClose}>Skip</button>}
          <button className="btn-primary" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? 'Start' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
