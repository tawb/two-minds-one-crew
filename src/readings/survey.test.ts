import { describe, expect, it } from 'vitest';
import { buildMentalReport, reactionLabel, TALK_TO_SOMEONE } from './mental';
import { isVeryLow, loadSurveys, makeResult, saveSurvey, scoreSurvey, SURVEY_QUESTIONS, surveyLabel } from './survey';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('survey scoring', () => {
  it('has the five questions and scores the sum times 4 as a percent', () => {
    expect(SURVEY_QUESTIONS).toHaveLength(5);
    expect(scoreSurvey([5, 5, 5, 5, 5])).toBe(100);
    expect(scoreSurvey([0, 0, 0, 0, 0])).toBe(0);
    expect(scoreSurvey([3, 4, 2, 5, 1])).toBe(60);
  });
  it('labels Good, Watch and Check-in at the boundaries (placeholder cut-offs 50 and 29)', () => {
    expect(surveyLabel(100)).toBe('Good');
    expect(surveyLabel(52)).toBe('Good');
    expect(surveyLabel(48)).toBe('Watch');
    expect(surveyLabel(32)).toBe('Watch');
    expect(surveyLabel(28)).toBe('Check-in');
    expect(surveyLabel(0)).toBe('Check-in');
    expect(isVeryLow(28)).toBe(true);
    expect(isVeryLow(32)).toBe(false);
  });
  it('builds a result with an ISO time and the label', () => {
    const r = makeResult('A1', [1, 1, 1, 1, 1], Date.UTC(2026, 10, 14, 15));
    expect(r).toMatchObject({ subjectId: 'A1', score: 20, label: 'Check-in', timestamp: '2026-11-14T15:00:00.000Z' });
  });
});

describe('survey storage (appears in History)', () => {
  it('saves, loads and keeps the newest results', () => {
    const s = mem();
    saveSurvey(makeResult('A1', [5, 5, 5, 5, 5], 1000), s);
    saveSurvey(makeResult('A1', [0, 0, 0, 0, 0], 2000), s);
    const all = loadSurveys(s);
    expect(all.map((x) => x.score)).toEqual([100, 0]);
  });
  it('does not fail when storage is missing or broken', () => {
    expect(() => saveSurvey(makeResult('A1', [1, 1, 1, 1, 1]), null)).not.toThrow();
    expect(loadSurveys(null)).toEqual([]);
    expect(loadSurveys({ getItem: () => '{not json' })).toEqual([]);
  });
});

describe('mental report', () => {
  const good = makeResult('A1', [5, 4, 5, 4, 5]);
  const watch = makeResult('A1', [2, 3, 2, 3, 2]);
  const veryLow = makeResult('A1', [1, 1, 1, 0, 1]);
  it('maps the camera state to the same three words', () => {
    expect(reactionLabel('normal')).toBe('Good');
    expect(reactionLabel('watch')).toBe('Watch');
    expect(reactionLabel('check-in suggested')).toBe('Check-in');
    expect(reactionLabel('inconclusive')).toBeNull();
  });
  it('everything good: labels, no recommendation, no talk-to-someone message', () => {
    const r = buildMentalReport({ state: 'normal', medianReactionMs: 640 }, good);
    expect(r.reaction).toEqual({ label: 'Good', medianMs: 640 });
    expect(r.survey).toMatchObject({ label: 'Good' });
    expect(r.recommendations).toEqual([]);
    expect(r.talkToSomeone).toBe(false);
  });
  it('a low reaction score alone gives recommendations', () => {
    const r = buildMentalReport({ state: 'watch', medianReactionMs: 1500 }, good);
    expect(r.recommendations.join(' ')).toMatch(/crewmate/);
    expect(r.recommendations.join(' ')).toMatch(/flight surgeon/);
  });
  it('a low survey score alone gives recommendations: crewmate, rest, daylight, flight surgeon', () => {
    const t = buildMentalReport({ state: 'normal', medianReactionMs: 600 }, watch).recommendations.join(' ').toLowerCase();
    for (const w of ['crewmate', 'rest', 'daylight', 'flight surgeon']) expect(t).toContain(w);
  });
  it('a very low survey score shows the talk to someone message and asks for same-day contact', () => {
    const r = buildMentalReport({ state: 'normal', medianReactionMs: 600 }, veryLow);
    expect(r.talkToSomeone).toBe(true);
    expect(TALK_TO_SOMEONE.toLowerCase()).toContain('talk to someone');
    expect(r.recommendations.join(' ')).toContain('today');
  });
  it('a skipped survey leaves only the reaction result, an unfinished camera test only the survey', () => {
    expect(buildMentalReport({ state: 'normal', medianReactionMs: 600 }, null).survey).toBeNull();
    expect(buildMentalReport(null, good).reaction).toBeNull();
    expect(buildMentalReport({ state: 'inconclusive', medianReactionMs: null }, null).recommendations).toEqual([]);
  });
});
