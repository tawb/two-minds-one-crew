import { lazy, Suspense, useEffect, useState } from 'react';
import { CV_RESULT_EVENT, type CvResultDetail } from '../features/cv-response-check/events';
import { buildMentalReport, SCREENING_NOTE, TALK_TO_SOMEONE } from '../readings/mental';
import { makeResult, saveSurvey, SURVEY_LEAD, SURVEY_QUESTIONS, SURVEY_SCALE, type MentalLabel, type SurveyResult } from '../readings/survey';

const ResponseCheck = lazy(() => import('../features/cv-response-check'));

const TONE: Record<MentalLabel, string> = { Good: 'pill-ok', Watch: 'pill-warn', 'Check-in': 'pill-review' };
const Label = ({ l }: { l: MentalLabel | null }) => (l ? <span className={`pill ${TONE[l]}`}>{l}</span> : <span className="muted">Not enough data</span>);

/** Five questions, one per screen, one tap each. Under a minute. */
function Survey({ onDone, onSkip, userId }: { onDone: (r: SurveyResult) => void; onSkip: () => void; userId: string }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const pick = (v: number) => {
    const next = [...answers.slice(0, i), v];
    if (i === SURVEY_QUESTIONS.length - 1) onDone(makeResult(userId, next));
    else { setAnswers(next); setI(i + 1); }
  };
  return (
    <div className="mc-card" role="group" aria-label="Quick survey">
      <div className="mc-top">
        <span className="vlabel">Quick survey · {i + 1} of {SURVEY_QUESTIONS.length}</span>
        <button className="linkish" onClick={onSkip}>Skip survey</button>
      </div>
      <div className="mc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={SURVEY_QUESTIONS.length} aria-valuenow={i}><span style={{ width: `${(i / SURVEY_QUESTIONS.length) * 100}%` }} /></div>
      <p className="mc-lead">{SURVEY_LEAD}</p>
      <h2 className="mc-q">{SURVEY_QUESTIONS[i]}</h2>
      <div className="mc-scale">
        {SURVEY_SCALE.map((o) => (
          <button key={o.value} className={`mc-opt ${answers[i] === o.value ? 'on' : ''}`} onClick={() => pick(o.value)} aria-label={`${o.value}, ${o.label}`}>
            <b>{o.value}</b><small>{o.label}</small>
          </button>
        ))}
      </div>
      {i > 0 && <button className="linkish" onClick={() => setI(i - 1)}>Back</button>}
    </div>
  );
}

function Report({ reaction, survey }: { reaction: CvResultDetail | null; survey: SurveyResult | null }) {
  const r = buildMentalReport(reaction, survey);
  return (
    <section className="mc-report" aria-label="Mental report">
      <h2>Mental report</h2>
      <div className="mc-rows">
        <div><span className="vlabel">Reaction time</span><div className="mc-val">{r.reaction ? (r.reaction.medianMs !== null ? `${Math.round(r.reaction.medianMs)} ms` : 'n/a') : 'Not done'} {r.reaction && <Label l={r.reaction.label} />}</div></div>
        <div><span className="vlabel">Survey</span><div className="mc-val">{r.survey ? `${r.survey.score}%` : 'Skipped'} {r.survey && <Label l={r.survey.label} />}</div></div>
      </div>
      {r.talkToSomeone && <p className="banner error">{TALK_TO_SOMEONE}</p>}
      {r.recommendations.length > 0 && <ul className="plain">{r.recommendations.map((x) => <li key={x}>{x}</li>)}</ul>}
      <p className="fine left">{SCREENING_NOTE}</p>
    </section>
  );
}

/** The Mental check: an optional quick survey first, then the camera reaction test, then one combined report. */
export default function MentalCheck({ userId }: { userId: string }) {
  const [stage, setStage] = useState<'survey' | 'camera'>('survey');
  const [survey, setSurvey] = useState<SurveyResult | null>(null);
  const [reaction, setReaction] = useState<CvResultDetail | null>(null);

  useEffect(() => {
    const on = (ev: Event) => setReaction((ev as CustomEvent<CvResultDetail>).detail);
    window.addEventListener(CV_RESULT_EVENT, on);
    return () => window.removeEventListener(CV_RESULT_EVENT, on);
  }, []);

  if (stage === 'camera') {
    return (
      <div className="mc">
        <Suspense fallback={<p className="loading">Loading…</p>}><ResponseCheck userId={userId} /></Suspense>
        {(survey || reaction) && <Report reaction={reaction} survey={survey} />}
      </div>
    );
  }
  return (
    <section className="mc">
      <h1 className="hero">Mental check</h1>
      {!survey ? (
        <Survey userId={userId} onSkip={() => setStage('camera')} onDone={(r) => { saveSurvey(r); setSurvey(r); }} />
      ) : (
        <>
          <Report reaction={null} survey={survey} />
          <div className="mc-next"><button className="btn-primary" onClick={() => setStage('camera')}>Continue to camera check</button></div>
        </>
      )}
    </section>
  );
}
