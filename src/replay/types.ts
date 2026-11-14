// Replay datasets: recorded (or synthetic) physiology played through the same pipeline as live devices.

import type { Posture, ReadingQuality } from '../readings/types';

export interface SleepSummaryFrame {
  hours: number;
  efficiencyPct: number;
  awakeMin: number; lightMin: number; deepMin: number; remMin: number;
  restingHr: number;
}

/** One moment of recorded data. Missing fields are simply absent. */
export interface ReplayFrame {
  /** Milliseconds from the start of the recording. */
  t: number;
  hr?: number;
  sys?: number;
  dia?: number;
  glucose?: number;
  skinTemp?: number;
  activity?: 'resting' | 'active';
  quality: ReadingQuality;
  posture: Posture;
  exerciseMinAgo: number | null;
  mealMinAgo: number | null;
  sleepHours: number | null;
  /** Grams of carbohydrate if a meal started at this frame (timeline marker). */
  mealCarbsG?: number;
  /** Set on the frame that ends a night of sleep. */
  sleep?: SleepSummaryFrame;
  /** Short label for the segment this frame belongs to, e.g. "sit" or "walk". */
  seg?: string;
}

export type ReplayKind = 'synthetic' | 'public';

export interface ReplayDataset {
  id: string;
  title: string;
  kind: ReplayKind;
  /** Short statement shown in the UI. */
  description: string;
  attribution: string;
  license: string;
  nonCommercial?: boolean;
  /** Plain-language limits of this data (for example: most public glucose data comes from people with diabetes). */
  limits: string;
  durationMs: number;
  frames: ReplayFrame[];
}

export interface ReplayState {
  on: boolean;
  playing: boolean;
  /** Seconds of recorded time per simulated second. */
  speed: number;
  loop: boolean;
  datasetId: string | null;
  datasetTitle: string | null;
  kind: ReplayKind | null;
  posMs: number;
  cycles: number;
  subjectId: string | null;
  ended: boolean;
}

export const REPLAY_SPEEDS = [1, 15, 60, 300] as const;
export const REPLAY_LABEL = 'REPLAY: recorded public data, not live';
export const SYNTHETIC_LABEL = 'REPLAY: synthetic data generated in the app, not live';

export const replayIdle = (): ReplayState => ({
  on: false, playing: false, speed: 60, loop: true, datasetId: null, datasetTitle: null, kind: null, posMs: 0, cycles: 0, subjectId: null, ended: false,
});
