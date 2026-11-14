import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CameraError, createLumaMeter, startCamera, stopCamera } from './camera';
import { CV_CONFIG } from './config';
import { dispatchCvResult, type CvResultDetail } from './events';
import { AssetsMissingError, GpuFailed, loadLandmarkers, reloadOnCpu, type Landmarkers } from './landmarker';
import { scoreAgainstBaseline, type BaselineScore } from './logic/baseline';
import { pickSessionCommands } from './logic/commands';
import { evaluateQuality, type QualityIssue } from './logic/quality';
import { buildReport, plainSummary, toEventDetail, type ResponseReport } from './logic/report';
import { SessionRunner, type RunnerView } from './logic/runner';
import { summarizeSession } from './logic/session';
import { decideStatus, type StatusDecision } from './logic/status';
import { drawSkeleton } from './SkeletonOverlay';
import { loadSessions, saveLastResult, saveSession } from './storage';
import type { Frame, SessionSummary } from './types';

export type Stage = 'idle' | 'loading' | 'gate' | 'running' | 'done' | 'error';

export interface CheckResult {
  summary: SessionSummary;
  baseline: BaselineScore;
  decision: StatusDecision;
  detail: CvResultDetail;
  report: ResponseReport;
  text: string;
  saved: boolean;
}

export interface UiError { title: string; message: string }

/**
 * Glue between the camera/landmark loop and the pure logic. Keeps React state small: the per-frame work happens in
 * refs and the state only changes when something visible changes.
 */
export function useResponseCheck(userId: string, opts: { detector?: Landmarkers } = {}) {
  // `detector` lets a test drive the real UI with scripted frames (no camera, no MediaPipe). Normal use leaves it out.
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<RunnerView | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [beep, setBeep] = useState(true);
  const [delegate, setDelegate] = useState<'GPU' | 'CPU' | null>(null);
  const [sessionsSoFar, setSessionsSoFar] = useState(() => loadSessions(userId).length);

  const stageRef = useRef<Stage>('idle');
  const lmRef = useRef<Landmarkers | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runnerRef = useRef<SessionRunner | null>(null);
  const loopRef = useRef<{ stop: () => void } | null>(null);
  const readyCount = useRef(0);
  const lastKey = useRef('');
  const lastCueSeq = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const beepRef = useRef(beep);
  beepRef.current = beep;
  const issuesKey = useRef('');
  const frameNo = useRef(0);
  const lastFrame = useRef<Frame | null>(null);
  const luma = useRef(createLumaMeter());
  const lumaVal = useRef<number | undefined>(undefined);

  const go = (s: Stage) => { stageRef.current = s; setStage(s); };

  const teardown = useCallback(() => {
    loopRef.current?.stop();
    loopRef.current = null;
    stopCamera(videoRef.current, streamRef.current);
    streamRef.current = null;
    if (canvasRef.current) drawSkeleton(canvasRef.current, null);
  }, []);

  useEffect(() => () => { teardown(); void audio.current?.close(); }, [teardown]);

  const playBeep = () => {
    const ctx = audio.current;
    if (!ctx || !beepRef.current) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch { /* sound is optional */ }
  };

  const finish = useCallback((runner: SessionRunner) => {
    const raw = runner.result();
    const history = loadSessions(userId);
    const prior = scoreAgainstBaseline(null, history);
    // "Slow" is judged against the person's own typical time once there is a baseline (otherwise against this session's own median)
    const summary = summarizeSession(raw, { referenceMs: prior.calibrating ? null : prior.baselineMedianMs });
    const baseline = scoreAgainstBaseline(summary.medianReactionMs, history);
    const decision = decideStatus(summary, baseline);
    const timestamp = Date.now();
    const detail = toEventDetail(summary, baseline, decision, timestamp);
    const saved = saveSession(userId, {
      timestamp, medianReactionMs: summary.medianReactionMs, commandMedianMs: summary.commandMedianMs,
      errorRate: summary.errorRate, lapseRate: summary.lapseRate, state: decision.state,
    }) && saveLastResult(userId, detail);
    teardown();
    setSessionsSoFar(loadSessions(userId).length);
    setResult({ summary, baseline, decision, detail, report: buildReport(raw, summary, baseline, decision, timestamp), text: plainSummary(summary, decision), saved });
    go('done');
    dispatchCvResult(detail);
  }, [userId, teardown]);

  const lastT = useRef(0);
  const onFrame = useCallback((video: HTMLVideoElement, captureT?: number) => {
    const lm = lmRef.current;
    if (!lm || (video.readyState < 2 && !opts.detector)) return;
    let frame: Frame;
    try {
      const nowMs = performance.now();
      frame = lm.detect(video, nowMs);
      // Use the camera's own capture time when the browser provides it: it removes the inference delay from every timestamp.
      if (captureT !== undefined && captureT <= nowMs + 1 && captureT > lastT.current) frame.t = captureT;
      lastT.current = frame.t;
    } catch (e) {
      if (e instanceof GpuFailed) {
        // GPU broke while running: rebuild on the CPU, skip this frame
        lmRef.current = null;
        void reloadOnCpu().then((n) => { lmRef.current = n; setDelegate('CPU'); }).catch(() => fail(new Error('landmarker')));
        return;
      }
      return;
    }
    frameNo.current++;
    if (frameNo.current % 8 === 1) lumaVal.current = luma.current(video);
    frame.luma = lumaVal.current;
    lastFrame.current = frame;
    if (canvasRef.current) {
      if (canvasRef.current.width !== 320) { canvasRef.current.width = 320; canvasRef.current.height = Math.round(320 / frame.aspect); }
      drawSkeleton(canvasRef.current, frame);
    }

    if (stageRef.current === 'gate') {
      const q = evaluateQuality(frame);
      readyCount.current = q.ok ? readyCount.current + 1 : 0;
      const key = q.issues.map((i) => i.code).join(',');
      if (key !== issuesKey.current) { issuesKey.current = key; setIssues(q.issues); }
      setReady(readyCount.current >= CV_CONFIG.quality.readyFrames);
    } else if (stageRef.current === 'running' && runnerRef.current) {
      const runner = runnerRef.current;
      const v = runner.step(frame);
      const key = `${v.phase}|${v.instruction}|${v.cue}|${v.label}|${v.countdown}|${v.lastOutcome}|${v.lostTracking}`;
      if (key !== lastKey.current) {
        lastKey.current = key;
        flushSync(() => setView(v)); // paint the cue now...
      }
      if (v.cueSeq !== lastCueSeq.current) {
        lastCueSeq.current = v.cueSeq;
        playBeep();
        // ...and tell the logic when it actually reached the screen, so reaction time starts from what the person could see
        requestAnimationFrame(() => runner.markCueShown(performance.now()));
      }
      if (runner.finished) finish(runner);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish]);

  const fail = (e: unknown) => {
    teardown();
    if (e instanceof AssetsMissingError) setError({ title: 'Offline files are missing', message: e.message });
    else if (e instanceof CameraError) setError({ title: 'Camera problem', message: e.message });
    else setError({ title: 'Could not start the check', message: 'The on-device models could not be loaded. Run "npm run setup:cv" and reload the page.' });
    go('error');
  };

  const begin = useCallback(async () => {
    setError(null); setResult(null); setReady(false); setIssues([]); setView(null);
    readyCount.current = 0; issuesKey.current = ''; lastKey.current = ''; lastCueSeq.current = 0; runnerRef.current = null;
    go('loading');
    try {
      const lm = opts.detector ?? await loadLandmarkers();
      lmRef.current = lm;
      setDelegate(lm.delegate);
      const video = videoRef.current;
      if (!video) throw new Error('no video element');
      if (!opts.detector) streamRef.current = await startCamera(video);
      go('gate');
      let active = true;
      const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
      lastT.current = 0;
      // Real camera: one detection per decoded video frame. Scripted test frames: drive with requestAnimationFrame.
      const next = (cb: (now: number, meta?: { captureTime?: number }) => void) => (!opts.detector && v.requestVideoFrameCallback ? v.requestVideoFrameCallback(cb as () => void) : requestAnimationFrame((t) => cb(t)));
      const tick = (_now: number, meta?: { captureTime?: number }) => {
        if (!active) return;
        onFrame(video, meta?.captureTime);
        next(tick);
      };
      loopRef.current = { stop: () => { active = false; } };
      next(tick);
    } catch (e) {
      fail(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFrame, teardown]);

  const start = useCallback(() => {
    if (stageRef.current !== 'gate' || !ready) return;
    try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* no audio */ }
    runnerRef.current = new SessionRunner(pickSessionCommands(Math.random), Math.random);
    lastKey.current = ''; lastCueSeq.current = 0;
    go('running');
  }, [ready]);

  const stop = useCallback(() => {
    runnerRef.current?.stop();
    runnerRef.current = null;
    teardown();
    setView(null);
    go('idle');
  }, [teardown]);

  const skip = useCallback(() => runnerRef.current?.skip(), []);

  return { videoRef, canvasRef, stage, issues, ready, view, result, error, beep, setBeep, delegate, sessionsSoFar, begin, start, stop, skip };
}
