import type { KeyboardEvent, ReactElement } from 'react';
import { REGIONS, type Flag, type RegionId } from '../sim/vitals';

export type RegionFlags = Record<RegionId, { flag: Flag; reports: number; unavailable: boolean }>;

interface Part { id: RegionId; shape: ReactElement; marker: [number, number] }

const parts: Part[] = [
  { id: 'head', shape: <circle cx="120" cy="52" r="35" />, marker: [148, 30] },
  { id: 'chest', shape: <rect x="70" y="102" width="100" height="94" rx="34" />, marker: [160, 118] },
  { id: 'abdomen', shape: <rect x="78" y="202" width="84" height="76" rx="30" />, marker: [152, 216] },
  { id: 'rightArm', shape: <rect x="26" y="112" width="30" height="170" rx="15" transform="rotate(5 41 112)" />, marker: [34, 128] },
  { id: 'leftArm', shape: <rect x="184" y="112" width="30" height="170" rx="15" transform="rotate(-5 199 112)" />, marker: [206, 128] },
  { id: 'rightLeg', shape: <rect x="76" y="286" width="40" height="214" rx="20" />, marker: [86, 306] },
  { id: 'leftLeg', shape: <rect x="124" y="286" width="40" height="214" rx="20" />, marker: [154, 306] },
];

export default function BodyMap({ flags, onSelect, onHover }: {
  flags: RegionFlags; onSelect: (r: RegionId) => void; onHover?: (r: RegionId | null) => void;
}) {
  const key = (r: RegionId) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r); } };
  return (
    <svg className="bodymap" viewBox="0 0 240 512" role="group" aria-label="Body map. Choose a body part.">
      <rect className="neck" x="108" y="84" width="24" height="26" rx="10" />
      {parts.map((p) => {
        const f = flags[p.id];
        const note = f.reports > 0 ? `${f.reports} report${f.reports > 1 ? 's' : ''}` : f.flag === 'verify' ? 'check' : f.flag === 'review' ? 'review suggested' : f.unavailable ? 'sensor not reporting' : '';
        return (
          <g key={p.id} className="part" role="button" tabIndex={0}
            aria-label={`${REGIONS[p.id].label}${note ? `, ${note}` : ''}`}
            onClick={() => onSelect(p.id)} onKeyDown={key(p.id)}
            onMouseEnter={() => onHover?.(p.id)} onMouseLeave={() => onHover?.(null)}
            onFocus={() => onHover?.(p.id)} onBlur={() => onHover?.(null)}>
            {p.shape}
            {(f.flag === 'verify' || f.flag === 'review' || f.reports > 0 || f.unavailable) && (
              <g className={`mk mk-${f.flag === 'review' ? 'review' : f.flag === 'verify' || f.reports > 0 ? 'verify' : 'none'}`} transform={`translate(${p.marker[0]} ${p.marker[1]})`}>
                <circle r="11" />
                <text textAnchor="middle" y="5">{f.flag === 'review' ? '!!' : f.flag === 'verify' || f.reports > 0 ? '!' : '–'}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
