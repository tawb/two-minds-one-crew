// Five-question well-being survey for the Mental check. A screening aid, not a diagnosis.
//
// The five statements and the 0 to 5 answers follow the WHO-5 Well-Being Index; the score is the sum x 4 (0 to 100).
// The label cut-offs follow common WHO-5 conventions (below 50 is low, 28 or lower is very low) but they are
// PLACEHOLDERS here, not validated for astronauts: TODO(flight-surgeon).

import { READINGS_CONFIG } from './config';

export type MentalLabel = 'Good' | 'Watch' | 'Check-in';

export const SURVEY_LEAD = 'Over the last 2 weeks, I felt';
export const SURVEY_QUESTIONS = [
  'cheerful and in good spirits',
  'calm and relaxed',
  'active and energetic',
  'rested when I woke up',
  'interested in my daily tasks',
] as const;

/** 0 = never ... 5 = all the time. */
export const SURVEY_SCALE: { value: number; label: string }[] = [
  { value: 0, label: 'Never' }, { value: 1, label: 'Rarely' }, { value: 2, label: 'Sometimes' },
  { value: 3, label: 'Often' }, { value: 4, label: 'Mostly' }, { value: 5, label: 'Always' },
];

export interface SurveyResult {
  id: string;
  subjectId: string;
  /** ISO time the survey was finished. */
  timestamp: string;
  answers: number[];
  /** Percent, 0 to 100 (sum of the answers x 4). */
  score: number;
  label: MentalLabel;
}

export const scoreSurvey = (answers: number[]): number => answers.reduce((s, a) => s + a, 0) * 4;

export function surveyLabel(score: number, cfg: { goodMin: number; watchMin: number } = READINGS_CONFIG.mental): MentalLabel {
  return score >= cfg.goodMin ? 'Good' : score >= cfg.watchMin ? 'Watch' : 'Check-in';
}

/** A score this low gets the "talk to someone" message. */
export const isVeryLow = (score: number, cfg: { watchMin: number } = READINGS_CONFIG.mental) => score < cfg.watchMin;

export function makeResult(subjectId: string, answers: number[], now = Date.now()): SurveyResult {
  const score = scoreSurvey(answers);
  return { id: `SV-${now}`, subjectId, timestamp: new Date(now).toISOString(), answers, score, label: surveyLabel(score) };
}

const KEY = 'av:survey:v1';
const MAX = 60;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const safeStorage = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function loadSurveys(storage: Pick<Storage, 'getItem'> | null = safeStorage()): SurveyResult[] {
  try {
    const raw = storage?.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as SurveyResult[]) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function saveSurvey(r: SurveyResult, storage: Store | null = safeStorage()): void {
  try { storage?.setItem(KEY, JSON.stringify([...loadSurveys(storage).filter((x) => x.id !== r.id), r].slice(-MAX))); } catch { /* storage unavailable: not kept */ }
}
