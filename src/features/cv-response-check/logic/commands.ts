import type { CommandDef } from '../types';

export type Rng = () => number;

export const COMMANDS: CommandDef[] = [
  { id: 'raiseRight', kind: 'pose', text: 'Raise your RIGHT hand' },
  { id: 'raiseLeft', kind: 'pose', text: 'Raise your LEFT hand' },
  { id: 'raiseBoth', kind: 'pose', text: 'Raise BOTH hands' },
  { id: 'touchNose', kind: 'pose', text: 'Touch your nose' },
  { id: 'handOnHead', kind: 'pose', text: 'Put a hand on your head' },
  { id: 'oneFinger', kind: 'hand', text: 'Show ONE finger' },
  { id: 'twoFingers', kind: 'hand', text: 'Show TWO fingers' },
  { id: 'fist', kind: 'hand', text: 'Make a FIST' },
  { id: 'openHand', kind: 'hand', text: 'Open your hand' },
];

/** Small seedable RNG so sessions and tests can be reproduced. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick `count` commands (default 6 to 8 at random) with no immediate repeats and at least two pose and two hand
 * commands. With 9 commands and at most 8 picks, drawing without replacement already guarantees no repeats.
 */
export function pickSessionCommands(rng: Rng, count?: number): CommandDef[] {
  const n = count ?? 6 + Math.floor(rng() * 3);
  const size = Math.min(n, COMMANDS.length);
  for (let attempt = 0; attempt < 50; attempt++) {
    const picked = shuffle(COMMANDS, rng).slice(0, size);
    const pose = picked.filter((c) => c.kind === 'pose').length;
    if (pose >= 2 && picked.length - pose >= 2) return picked;
  }
  return shuffle(COMMANDS, rng).slice(0, size);
}
