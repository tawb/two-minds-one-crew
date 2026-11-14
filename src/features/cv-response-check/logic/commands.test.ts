import { describe, expect, it } from 'vitest';
import { COMMANDS, mulberry32, pickSessionCommands } from './commands';
import { evaluateQuality } from './quality';
import { ASPECT, makeFrame, makePose } from './testkit';

describe('picking commands', () => {
  it('picks 6 to 8 commands, never the same one twice in a row, with a pose/hand mix', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const picked = pickSessionCommands(mulberry32(seed));
      seen.add(picked.length);
      expect(picked.length).toBeGreaterThanOrEqual(6);
      expect(picked.length).toBeLessThanOrEqual(8);
      for (let i = 1; i < picked.length; i++) expect(picked[i].id).not.toBe(picked[i - 1].id);
      expect(picked.filter((c) => c.kind === 'pose').length).toBeGreaterThanOrEqual(2);
      expect(picked.filter((c) => c.kind === 'hand').length).toBeGreaterThanOrEqual(2);
    }
    expect([...seen].sort()).toEqual([6, 7, 8]);
  });

  it('is reproducible for a given seed and covers every command over many sessions', () => {
    expect(pickSessionCommands(mulberry32(7)).map((c) => c.id)).toEqual(pickSessionCommands(mulberry32(7)).map((c) => c.id));
    const used = new Set<string>();
    for (let seed = 1; seed < 60; seed++) pickSessionCommands(mulberry32(seed)).forEach((c) => used.add(c.id));
    expect(used.size).toBe(COMMANDS.length);
  });
});

describe('quality gates', () => {
  it('passes for a person standing in view with hands visible and good light', () => {
    expect(evaluateQuality(makeFrame(0, {})).ok).toBe(true);
  });

  it('blocks and explains: nobody in view, hands missing, too far, too close, dark, bright', () => {
    expect(evaluateQuality(makeFrame(0, null)).issues[0].code).toBe('no-person');
    expect(evaluateQuality(makeFrame(0, { hideRight: true })).issues.map((i) => i.code)).toContain('hands');
    expect(evaluateQuality(makeFrame(0, { scale: 0.45 })).issues.map((i) => i.code)).toContain('too-far');
    const close = makePose({});
    close[12] = { x: 0.15, y: 0.45, visibility: 1 }; // shoulders 70 percent of the frame width apart
    close[11] = { x: 0.85, y: 0.45, visibility: 1 };
    expect(evaluateQuality({ t: 0, pose: close, hands: [], aspect: ASPECT, luma: 140 }).issues.map((i) => i.code)).toContain('too-close');
    expect(evaluateQuality(makeFrame(0, {}, [], { luma: 20 })).issues.map((i) => i.code)).toContain('dark');
    expect(evaluateQuality(makeFrame(0, {}, [], { luma: 250 })).issues.map((i) => i.code)).toContain('bright');
    for (const i of evaluateQuality(makeFrame(0, null)).issues) expect(i.message.length).toBeGreaterThan(10);
  });

  it('a head out of the picture is reported', () => {
    const pose = makePose({});
    pose[0] = { x: 0.5, y: -0.1, visibility: 1 };
    expect(evaluateQuality({ t: 0, pose, hands: [], aspect: ASPECT, luma: 140 }).issues.map((i) => i.code)).toContain('head');
  });
});
