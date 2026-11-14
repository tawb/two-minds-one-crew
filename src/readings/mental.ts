// The mental report: reaction time and survey score side by side, each with a Good / Watch / Check-in label.
// A screening aid, not a diagnosis. Wording is placeholder, TODO(flight-surgeon).

import type { CvResultDetail } from '../features/cv-response-check/events';
import { isVeryLow, type MentalLabel, type SurveyResult } from './survey';

/** The camera check's own state, in the same three words as the survey. null = too little data to say. */
export function reactionLabel(state: string): MentalLabel | null {
  if (state === 'normal') return 'Good';
  if (state === 'watch') return 'Watch';
  if (state === 'check-in suggested') return 'Check-in';
  return null;
}

export interface MentalReport {
  reaction: { label: MentalLabel | null; medianMs: number | null } | null;
  survey: { score: number; label: MentalLabel } | null;
  /** Short suggestions. Empty when everything that was done is Good. */
  recommendations: string[];
  /** True for a very low survey score. */
  talkToSomeone: boolean;
}

export const SCREENING_NOTE = 'A screening aid, not a diagnosis.';
export const TALK_TO_SOMEONE = 'Your survey score is very low. Please talk to someone today: a crewmate or the flight surgeon.';

export function buildMentalReport(reaction: Pick<CvResultDetail, 'state' | 'medianReactionMs'> | null, survey: SurveyResult | null): MentalReport {
  const r = reaction ? { label: reactionLabel(reaction.state), medianMs: reaction.medianReactionMs } : null;
  const s = survey ? { score: survey.score, label: survey.label } : null;
  const low = (l: MentalLabel | null | undefined) => l === 'Watch' || l === 'Check-in';
  const recommendations: string[] = [];
  if (low(r?.label) || low(s?.label)) {
    recommendations.push('Talk to a crewmate.', 'Rest and take a break.', 'Get some daylight or bright light.');
    if (r?.label === 'Check-in' || s?.label === 'Check-in') recommendations.push('Tell the flight surgeon today.');
    else recommendations.push('Tell the flight surgeon if this continues.');
  }
  return { reaction: r, survey: s, recommendations, talkToSomeone: !!survey && isVeryLow(survey.score) };
}
