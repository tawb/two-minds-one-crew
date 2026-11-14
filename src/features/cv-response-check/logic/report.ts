import type { CvResultDetail } from '../events';
import { COMMANDS } from './commands';
import type { CommandResult, PvtTrialResult, RawSession, SessionSummary } from '../types';
import type { BaselineScore } from './baseline';
import type { StatusDecision } from './status';

/** Numbers-only report (no video, no images, no landmarks). Safe to download or send. */
export interface ResponseReport {
  check: 'response';
  version: 1;
  timestamp: number;
  state: StatusDecision['state'];
  reasons: string[];
  disclaimer: string;
  summary: SessionSummary;
  baseline: BaselineScore;
  reaction: { index: number; reactionMs: number | null; gestureMs: number | null; lapse: boolean; falseStarts: number; discarded: boolean; discardReason: string | null; diag: PvtTrialResult['diag'] }[];
  commands: { id: string; label: string; outcome: string; reactionMs: number | null; gestureMs: number | null; confirmMs: number | null; wrongAttempts: number; peakSpeedSwPerS: number | null; smoothness: number | null; discarded: boolean; diag: CommandResult['diag'] }[];
  timingResolutionMs: number | null;
}

export function buildReport(raw: RawSession, summary: SessionSummary, baseline: BaselineScore, decision: StatusDecision, timestamp: number): ResponseReport {
  return {
    check: 'response', version: 1, timestamp,
    state: decision.state, reasons: decision.reasons, disclaimer: decision.disclaimer,
    summary, baseline,
    reaction: raw.reaction.map((t) => ({ index: t.index, reactionMs: t.reactionMs, gestureMs: t.gestureMs, lapse: t.lapse || (t.reactionMs !== null && t.reactionMs > summary.lapseThresholdMs), falseStarts: t.falseStarts, discarded: t.discarded, discardReason: t.discardReason, diag: t.diag })),
    commands: raw.commands.map((c) => ({ id: c.id, label: COMMANDS.find((d) => d.id === c.id)?.text ?? c.id, outcome: c.outcome, reactionMs: c.reactionMs, gestureMs: c.gestureMs, confirmMs: c.confirmMs, wrongAttempts: c.wrongAttempts, peakSpeedSwPerS: c.peakSpeedSwPerS, smoothness: c.smoothness, discarded: c.discarded, diag: c.diag })),
    timingResolutionMs: summary.frameIntervalMs,
  };
}

export function toEventDetail(summary: SessionSummary, baseline: BaselineScore, decision: StatusDecision, timestamp: number): CvResultDetail {
  return {
    check: 'response',
    state: decision.state,
    medianReactionMs: summary.medianReactionMs,
    baselineDeviation: baseline.deviation,
    completed: summary.completed,
    total: summary.total,
    errors: summary.errors,
    lapses: summary.lapses,
    falseStarts: summary.falseStarts,
    timestamp,
  };
}

/** One plain-language paragraph for the end screen. */
export function plainSummary(summary: SessionSummary, decision: StatusDecision): string {
  const head: Record<StatusDecision['state'], string> = {
    normal: 'Your responses look normal for you.',
    watch: 'Your responses were a little off from usual. Worth keeping an eye on.',
    'check-in suggested': 'Your responses were noticeably off from usual. A check-in with the flight surgeon is suggested.',
    inconclusive: 'There was not enough reliable data to say.',
  };
  const speed = summary.medianReactionMs === null ? '' : ` Median reaction ${summary.medianReactionMs} ms.`;
  return `${head[decision.state]}${speed} ${summary.completed} of ${summary.total} trials completed.`;
}
