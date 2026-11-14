import { CV_CONFIG } from './config';
import type { ResponseState } from './types';
import type { Landmarkers } from './landmarker';
import { useResponseCheck, type CheckResult } from './useResponseCheck';
import './response-check.css';

const STATE_LABEL: Record<ResponseState, { text: string; icon: string; cls: string }> = {
  normal: { text: 'Normal', icon: '✓', cls: 'lv-ok' },
  watch: { text: 'Watch', icon: '▲', cls: 'lv-verify' },
  'check-in suggested': { text: 'Check-in suggested', icon: '◆', cls: 'lv-review' },
  inconclusive: { text: 'Inconclusive', icon: '–', cls: 'lv-logged' },
};

function download(result: CheckResult) {
  const blob = new Blob([JSON.stringify(result.report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `response-check-${new Date(result.detail.timestamp).toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Num({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div className="rc-num">
      <span className="rc-num-v">{value ?? '–'}{value !== null && unit ? <small> {unit}</small> : null}</span>
      <span className="rc-num-l">{label}</span>
    </div>
  );
}

function Summary({ r, onAgain }: { r: CheckResult; onAgain: () => void }) {
  const st = STATE_LABEL[r.decision.state];
  const s = r.summary;
  return (
    <section className="rc-card" aria-live="polite">
      <div className="rc-status">
        <span className={`badge ${st.cls}`}><span aria-hidden="true">{st.icon}</span> {st.text}</span>
        {r.decision.calibrating && <span className="pill">Calibrating · {Math.min(r.decision.baselineCount, r.baseline.sessionsNeeded)} of {r.baseline.sessionsNeeded} baseline sessions</span>}
      </div>
      <p className="rc-text">{r.text}</p>
      <ul className="rc-reasons">{r.decision.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
      <p className="rc-disclaimer">{r.decision.disclaimer}</p>
      <div className="rc-nums">
        <Num label="Median reaction" value={s.medianReactionMs} unit="ms" />
        <Num label="Command speed" value={s.commandMedianMs} unit="ms" />
        <Num label="Completed" value={`${s.completed} of ${s.total}`} />
        <Num label="Errors" value={s.errors} />
        <Num label="Lapses" value={s.lapses} />
        <Num label="False starts" value={s.falseStarts} />
        <Num label="Discarded" value={s.discarded} />
        <Num label="Timing resolution" value={s.frameIntervalMs} unit="ms" />
        <Num label="Peak hand speed" value={s.peakSpeedMedian} unit="shoulder widths/s" />
        <Num label="Smoothness" value={s.smoothnessMedian} />
      </div>
      {r.baseline.baselineMedianMs !== null && !r.baseline.calibrating && (
        <p className="rc-fine">Your usual median reaction: {r.baseline.baselineMedianMs} ms · deviation score {r.baseline.deviation}</p>
      )}
      {!r.saved && <p className="banner warn">This result could not be saved on this device, so it will not count toward your baseline.</p>}
      <details className="rc-details">
        <summary>Trial by trial</summary>
        <div className="rc-table-wrap">
          <table className="rc-table">
            <thead><tr><th>Reaction trial</th><th>Hand moved</th><th>Hand raised</th><th>Note</th><th>Camera saw</th></tr></thead>
            <tbody>
              {r.report.reaction.map((t) => (
                <tr key={t.index}>
                  <td>{t.index + 1}</td>
                  <td>{t.reactionMs === null ? '–' : `${Math.round(t.reactionMs)} ms`}</td>
                  <td>{t.gestureMs === null ? '–' : `${Math.round(t.gestureMs)} ms`}</td>
                  <td>{t.discarded ? `discarded: ${t.discardReason}` : t.reactionMs === null ? 'no response (lapse)' : t.lapse ? 'lapse (unusually slow)' : 'ok'}{t.falseStarts ? `, ${t.falseStarts} false start${t.falseStarts > 1 ? 's' : ''}` : ''}</td>
                  <td>hand rose {t.diag.peakRiseSw} shoulder widths · raised pose in {t.diag.raisedFrames} frames</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="rc-table">
            <thead><tr><th>Command</th><th>Hand moved</th><th>Gesture seen</th><th>Wrong tries</th><th>Result</th><th>Camera saw</th></tr></thead>
            <tbody>
              {r.report.commands.map((c, i) => (
                <tr key={i}>
                  <td>{c.label}</td>
                  <td>{c.reactionMs === null ? '–' : `${Math.round(c.reactionMs)} ms`}</td>
                  <td>{c.gestureMs === null ? '–' : `${Math.round(c.gestureMs)} ms`}</td>
                  <td>{c.wrongAttempts}</td>
                  <td>{c.discarded ? 'discarded' : c.outcome}</td>
                  <td>{Object.entries(c.diag.seen).map(([g, n]) => `${g} ×${n}`).join(', ') || 'no gesture'} · hand rose {c.diag.peakRiseSw}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rc-fine left">"Hand moved" is the reaction time (the hand starts to move). "Gesture seen" also includes the time the arm takes to get there. Reaction trials slower than {s.lapseThresholdMs} ms count as lapses.</p>
      </details>
      <p className="rc-fine">Timing includes camera and processing delay, so compare with your own results only, not with button-press tests.</p>
      <div className="rc-actions">
        <button className="btn-primary" onClick={onAgain}>Run again</button>
        <button className="btn-secondary" onClick={() => download(r)}>Download report (numbers only)</button>
      </div>
    </section>
  );
}

/** The Response check screen. `userId` keeps each astronaut's baseline separate. */
export default function ResponseCheckPage({ userId = 'default', detector }: { userId?: string; detector?: Landmarkers }) {
  const c = useResponseCheck(userId, { detector });
  const showVideo = c.stage === 'gate' || c.stage === 'running' || c.stage === 'loading';
  const v = c.view;
  return (
    <section className="rc">
      <h1 className="hero">Mental check</h1>
      <p className="sub">A short alertness check. Do what the screen asks and we time how quickly and accurately you respond.</p>

      {c.stage === 'idle' && !c.result && (
        <div className="rc-card">
          <h2>Before you start</h2>
          <ul className="rc-list">
            <li>Sit or stand so your head, shoulders and both hands are in view, with good light in front of you.</li>
            <li>About 1 to 2 minutes: 5 quick reaction trials, then {CV_CONFIG.commands.perSessionMin} to {CV_CONFIG.commands.perSessionMax} commands.</li>
            <li><b>Private:</b> the camera is analysed on this device only. No video or pictures are saved or sent. Only numbers and times are kept.</li>
            <li>Baseline: {c.sessionsSoFar >= CV_CONFIG.baseline.minSessions ? `compared with your own last ${Math.min(c.sessionsSoFar, CV_CONFIG.baseline.maxSessions)} sessions` : `calibrating, ${c.sessionsSoFar} of ${CV_CONFIG.baseline.minSessions} baseline sessions`}.</li>
          </ul>
          <p className="rc-disclaimer">This is not a diagnosis. Tiredness, poor sleep or lighting can affect it.</p>
          <button className="btn-primary" onClick={c.begin}>Turn on camera</button>
        </div>
      )}

      {c.stage === 'error' && c.error && (
        <div className="rc-card" role="alert">
          <h2>{c.error.title}</h2>
          <p>{c.error.message}</p>
          <button className="btn-primary" onClick={c.begin}>Try again</button>
        </div>
      )}

      <div className={`rc-stage ${showVideo ? '' : 'rc-hidden'}`}>
        {c.stage === 'running' && v && (
          <div className={`rc-prompt ${v.cue ? 'rc-cue' : ''}`} aria-live="assertive">
            <span className="rc-label">{v.label}</span>
            <span className={v.phase === 'countdown' ? 'rc-count' : 'rc-instruction'}>{v.instruction}</span>
            <span className="rc-hint">{v.hint}</span>
            {v.lostTracking && <span className="rc-warn">I lost track of you. Step back into view.</span>}
          </div>
        )}
        {c.stage === 'loading' && <div className="rc-prompt"><span className="rc-instruction">Loading the on-device models…</span></div>}
        {c.stage === 'gate' && (
          <div className="rc-prompt" aria-live="polite">
            <span className="rc-instruction">{c.ready ? 'Ready' : 'Getting set up'}</span>
            {c.issues.length === 0 && !c.ready && <span className="rc-hint">Hold still for a moment…</span>}
            <ul className="rc-issues">{c.issues.map((i) => <li key={i.code}>{i.message}</li>)}</ul>
          </div>
        )}
        <div className="rc-video">
          <video ref={c.videoRef} playsInline muted aria-label="Your camera view (mirrored)" />
          <canvas ref={c.canvasRef} aria-hidden="true" />
        </div>
        <div className="rc-actions">
          {c.stage === 'gate' && <button className="btn-primary" disabled={!c.ready} onClick={c.start}>Start</button>}
          {c.stage === 'running' && <button className="btn-secondary" onClick={c.skip}>Skip</button>}
          {(c.stage === 'gate' || c.stage === 'running') && <button onClick={c.stop}>Stop</button>}
          <label className="rc-check"><input type="checkbox" checked={c.beep} onChange={(e) => c.setBeep(e.target.checked)} /> Beep at the signal</label>
        </div>
        {c.delegate && c.stage !== 'idle' && <p className="rc-fine">Running on the {c.delegate === 'GPU' ? 'graphics chip' : 'CPU'}, on this device.</p>}
      </div>

      {c.stage === 'done' && c.result && <Summary r={c.result} onAgain={c.begin} />}
    </section>
  );
}
