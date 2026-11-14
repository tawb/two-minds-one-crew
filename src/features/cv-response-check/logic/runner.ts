import { CV_CONFIG } from '../config';
import type { CommandDef, CommandResult, Frame, RawSession, TrialOutcome } from '../types';
import type { Rng } from './commands';
import {
  createCommandTrial, finalizeCommandTrial, markCueShown, skipCommandTrial, stepCommandTrial,
  type CommandTrialState,
} from './commandTrial';
import { detect } from './gestures';
import { createPvt, markPvtCueShown, skipPvtTrial, stepPvt, type PvtState } from './reaction';
import { median } from './stats';

export interface RunnerView {
  phase: 'countdown' | 'reaction' | 'commands' | 'done' | 'stopped';
  countdown: number | null;
  /** Big text on screen. */
  instruction: string;
  hint: string;
  /** True while the "go" signal is showing. */
  cue: boolean;
  /** Increases every time a new cue appears (beep / paint-timestamp trigger). */
  cueSeq: number;
  label: string;
  step: number;
  steps: number;
  lostTracking: boolean;
  /** Result of the trial that just finished, for a brief flash. */
  lastOutcome: TrialOutcome | 'lapse' | 'false-start' | null;
}

/**
 * Drives a whole session: 3-2-1 countdown -> reaction round -> command trials. Pure with respect to the DOM:
 * time comes only from `frame.t`, randomness from the injected RNG, so tests can run a session in milliseconds.
 */
export class SessionRunner {
  private phase: RunnerView['phase'] = 'countdown';
  private startedAt: number | null = null;
  private pvt: PvtState = createPvt();
  private trial: CommandTrialState | null = null;
  private cmdIndex = 0;
  private commandResults: CommandResult[] = [];
  private cueSeq = 0;
  private lastCue = false;
  private lastOutcome: RunnerView['lastOutcome'] = null;
  private lastPvtTrials = 0;
  private lastFalseStarts = 0;
  private intervals: number[] = [];
  private prevT: number | null = null;
  private lostRun = 0;
  private endedAt = 0;

  constructor(private readonly commands: CommandDef[], private readonly rng: Rng) {}

  get finished() { return this.phase === 'done'; }
  get stopped() { return this.phase === 'stopped'; }

  step(frame: Frame): RunnerView {
    if (this.phase === 'done' || this.phase === 'stopped') return this.view(frame, null);
    if (this.startedAt === null) this.startedAt = frame.t;
    if (this.prevT !== null) this.intervals.push(frame.t - this.prevT);
    this.prevT = frame.t;

    const det = detect(frame);
    this.lostRun = det.poseOk ? 0 : this.lostRun + 1;

    if (this.phase === 'countdown') {
      if (frame.t - this.startedAt >= CV_CONFIG.countdownMs) this.phase = 'reaction';
    } else if (this.phase === 'reaction') {
      this.pvt = stepPvt(this.pvt, frame, det, this.rng);
      if (this.pvt.falseStartsTotal > this.lastFalseStarts) { this.lastFalseStarts = this.pvt.falseStartsTotal; this.lastOutcome = 'false-start'; }
      if (this.pvt.trials.length > this.lastPvtTrials) {
        const t = this.pvt.trials[this.pvt.trials.length - 1];
        this.lastPvtTrials = this.pvt.trials.length;
        this.lastOutcome = t.lapse ? 'lapse' : t.skipped ? 'skipped' : this.lastOutcome === 'false-start' ? 'false-start' : 'correct';
      }
      if (this.pvt.phase === 'done') this.beginCommands(frame.t);
    }
    if (this.phase === 'commands' && this.trial) {
      this.trial = stepCommandTrial(this.trial, frame, det);
      if (this.trial.phase === 'done') this.finishTrial(frame.t);
    }
    return this.view(frame, det.poseOk);
  }

  /** Call when the cue has been painted, so reaction time counts from when the person could see it. */
  markCueShown(t: number) {
    if (this.phase === 'reaction') this.pvt = markPvtCueShown(this.pvt, t);
    else if (this.phase === 'commands' && this.trial) this.trial = markCueShown(this.trial, t);
  }

  /** Skip the current trial (not counted as an error). */
  skip() {
    if (this.phase === 'reaction') this.pvt = skipPvtTrial(this.pvt);
    else if (this.phase === 'commands' && this.trial) this.trial = skipCommandTrial(this.trial);
  }

  stop() { if (this.phase !== 'done') this.phase = 'stopped'; }

  result(): RawSession {
    const clean = this.intervals.filter((x) => x > 0 && x < 500);
    return {
      startedAt: this.startedAt ?? 0,
      endedAt: this.endedAt,
      reaction: this.pvt.trials,
      commands: this.commandResults,
      frameIntervalMs: median(clean),
    };
  }

  private beginCommands(t: number) {
    this.phase = 'commands';
    this.cmdIndex = 0;
    this.trial = this.commands.length ? createCommandTrial(this.commands[0], t) : null;
    if (!this.trial) this.finish(t);
  }

  private finishTrial(t: number) {
    if (!this.trial) return;
    const res = finalizeCommandTrial(this.trial);
    this.commandResults.push(res);
    this.lastOutcome = res.outcome;
    this.cmdIndex++;
    if (this.cmdIndex >= this.commands.length) { this.trial = null; this.finish(t); }
    else this.trial = createCommandTrial(this.commands[this.cmdIndex], t);
  }

  private finish(t: number) { this.phase = 'done'; this.endedAt = t; }

  private view(frame: Frame, poseOk: boolean | null): RunnerView {
    const total = CV_CONFIG.reaction.trials + this.commands.length;
    const base = { lostTracking: poseOk === false && this.lostRun > 15, lastOutcome: this.lastOutcome, countdown: null as number | null };
    let cue = false;
    let v: Omit<RunnerView, 'cueSeq' | 'lostTracking' | 'lastOutcome' | 'countdown'>;
    if (this.phase === 'countdown') {
      const left = Math.max(0, Math.ceil((CV_CONFIG.countdownMs - (frame.t - (this.startedAt ?? frame.t))) / 1000));
      base.countdown = left;
      v = { phase: 'countdown', instruction: String(left || 'Go'), hint: 'Get ready. Keep your hands down by your sides.', cue: false, label: 'Starting', step: 0, steps: total };
    } else if (this.phase === 'reaction') {
      cue = this.pvt.phase === 'cue';
      const idx = Math.min(this.pvt.index + 1, CV_CONFIG.reaction.trials);
      v = {
        phase: 'reaction',
        instruction: cue ? 'NOW! Raise a hand' : this.pvt.phase === 'handsDown' ? 'Hands down' : 'Wait for the signal…',
        hint: cue ? 'Raise either hand as fast as you can, up toward your head. You can lower it right after.' : 'Keep your hands down until the signal appears.',
        cue, label: `Reaction ${idx} of ${CV_CONFIG.reaction.trials}`, step: this.pvt.trials.length, steps: total,
      };
    } else if (this.phase === 'commands' && this.trial) {
      cue = this.trial.phase === 'cue';
      v = {
        phase: 'commands',
        instruction: cue ? this.trial.command.text : 'Hands down…',
        hint: cue ? 'Do it, then hold it still for a moment.' : 'Lower your hands. The next command is coming.',
        cue, label: `Command ${this.cmdIndex + 1} of ${this.commands.length}`, step: CV_CONFIG.reaction.trials + this.cmdIndex, steps: total,
      };
    } else {
      v = { phase: this.phase === 'stopped' ? 'stopped' : 'done', instruction: this.phase === 'stopped' ? 'Stopped' : 'All done', hint: '', cue: false, label: '', step: total, steps: total };
    }
    if (cue && !this.lastCue) this.cueSeq++;
    this.lastCue = cue;
    return { ...v, ...base, cueSeq: this.cueSeq };
  }
}
