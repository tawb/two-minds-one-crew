import type { VitalKey } from '../sim/vitals';

/** Simple line icons drawn for this app (24×24). */
const P: Record<VitalKey, string> = {
  pulse: 'M12 20.5s-7.5-4.6-7.5-10A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.9c0 5.4-7.5 10-7.5 10Z',
  bp: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 8.5 4-3.5M7 15h10',
  temp: 'M10 14.5V5.5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0Zm2 1v-6',
  glucose: 'M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5Z',
  sleep: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  air: 'M3 9h10.5a2.5 2.5 0 1 0-2.5-2.5M3 13h14a2.5 2.5 0 1 1-2.5 2.5M3 17h7',
  activity: 'M13 4.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0ZM8 21l2.2-6.5L8 11.5l4-2 2.5 3 3 .5M12 14.5l3.5 6.5',
};

export function VitalIcon({ k, size = 28 }: { k: VitalKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[k]} />
    </svg>
  );
}

const G = {
  warn: 'M12 4 21 19.5H3L12 4Zm0 6v4.5m0 2.7v.1',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 4v4.7l3 1.8',
  lock: 'M7.5 11V8a4.5 4.5 0 0 1 9 0v3M6 11h12v9H6z',
  check: 'M5 12.5 10 17.5 19 7',
  close: 'M6 6l12 12M18 6 6 18',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4',
  right: 'M5 12h14m-6-6 6 6-6 6',
  left: 'M15 5l-7 7 7 7',
  up: 'M12 19V5m-6 6 6-6 6 6',
  down: 'M12 5v14m-6-6 6 6 6-6',
  off: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM6 18 18 6',
  minus: 'M6 12h12',
  wave: 'M3 12c2.5-5 5-5 7.5 0s5 5 7.5 0 2-3 3-3',
  help: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5',
  body: 'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6 9.5h12M12 9.5V15m0 0-3 6m3-6 3 6',
} as const;
export type IconName = keyof typeof G;

export function Icon({ n, size = '1em' }: { n: IconName; size?: number | string }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={G[n]} />
    </svg>
  );
}

const S = {
  circle: <circle cx="12" cy="12" r="8" />,
  triangle: <path d="M12 3.5 21.5 20h-19Z" />,
  diamond: <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />,
  square: <rect x="4.5" y="4.5" width="15" height="15" rx="2" />,
  ring: <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2.5" />,
  half: <><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2.5" /><path d="M12 5a7 7 0 0 0 0 14Z" /></>,
} as const;
export type ShapeName = keyof typeof S;

export function Shape({ n, size = '.8em' }: { n: ShapeName; size?: number | string }) {
  return <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">{S[n]}</svg>;
}
