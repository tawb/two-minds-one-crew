import type { ReactNode } from 'react';
import { fmtAge, fmtTime } from '../sim/fmt';
import type { Reading } from '../sim/selectors';
import { LEVEL_LABEL, type Level, type Obs, type Origin, type Quality } from '../sim/types';
import { Icon, Shape, type IconName, type ShapeName } from './icons';

const LEVEL_SHAPE: Record<Level, ShapeName> = { logged: 'circle', verify: 'triangle', review: 'diamond', help: 'square' };

/** Colour + shape + word, never colour alone. */
export function LevelBadge({ level }: { level: Level }) {
  return (
    <span className={`badge lv-${level}`}>
      <Shape n={LEVEL_SHAPE[level]} /> {LEVEL_LABEL[level]}
    </span>
  );
}

export function NoPrompts() {
  return <span className="badge lv-ok"><Icon n="check" /> No prompts</span>;
}

const ORIGIN_LABEL: Record<Origin, string> = {
  simulated: 'Simulated', device: 'Device', manual: 'Manual', 'simulated-self-report': 'Simulated self-report', replay: 'Replay',
};
export function OriginChip({ origin }: { origin: Origin }) {
  return <span className={`chip origin-${origin}`}>{ORIGIN_LABEL[origin]}</span>;
}

export function QualityChip({ quality }: { quality: Quality }) {
  const icon: IconName = quality === 'good' ? 'check' : quality === 'poor' ? 'wave' : quality === 'excluded' ? 'off' : 'minus';
  return <span className={`chip q-${quality}`}><Icon n={icon} /> {quality}</span>;
}

export function StateChip({ r }: { r: Reading }) {
  const map = {
    current: ['check', 'Current'], stale: ['clock', 'Stale'], missing: ['warn', 'No signal'], none: ['minus', 'No data'],
  } as const satisfies Record<string, readonly [IconName, string]>;
  const [icon, word] = map[r.state];
  return <span className={`chip st-${r.state}`}><Icon n={icon} /> {word}</span>;
}

export function SimBadge({ children = 'Simulation' }: { children?: ReactNode }) {
  return <span className="sim-badge">{children}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: {
  tabs: [T, string][]; value: T; onChange: (t: T) => void; label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map(([id, text]) => (
        <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'tab on' : 'tab'} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close"><Icon n="close" /> Close</button>
        </header>
        {children}
      </aside>
    </div>
  );
}

/** Source line used under every value: time, age, device, quality, origin. */
export function Provenance({ o, now }: { o: Obs; now?: number }) {
  return (
    <span className="prov">
      {fmtTime(o.measuredAt)}{now !== undefined ? ` (${fmtAge(now - o.measuredAt)} ago)` : ''} · {o.deviceId} · <QualityChip quality={o.quality} /> <OriginChip origin={o.origin} />
    </span>
  );
}
