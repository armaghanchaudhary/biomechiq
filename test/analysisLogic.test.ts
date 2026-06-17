// test/analysisLogic.test.ts
// Workstream J: compare-vs-ideal + best-rep selection.
// Pure synthetic data; deterministic.

import { describe, it, expect } from 'vitest';
import {
  compareToIdeal,
  evaluateJointDeviation,
  type IdealComparison,
} from '@/domain/services/compareToIdeal';
import {
  scoreReps,
  selectBestRep,
  selectTopReps,
  selectFastestRep,
} from '@/domain/services/bestRep';
import { SPORT_PROFILES } from '@/domain';
import type { Landmark } from '@/domain';
import type { Rep } from '@/domain/services/repDetector';

// ── Landmark helpers ──────────────────────────────────

const N = 33;

/** A full visible landmark array, all at the origin (overridable per index). */
function makePose(overrides: Record<number, Partial<Landmark>>): Landmark[] {
  const lm: Landmark[] = Array.from({ length: N }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 1,
  }));
  for (const [idx, v] of Object.entries(overrides)) {
    lm[Number(idx)] = { ...lm[Number(idx)], ...v };
  }
  return lm;
}

/**
 * Build a pose where joint (a,b,c) forms a known angle at vertex b.
 * Places b at origin, a along +x, and c at `angleDeg` from a around b.
 */
function poseWithAngle(
  a: number,
  b: number,
  c: number,
  angleDeg: number,
): Landmark[] {
  const rad = (angleDeg * Math.PI) / 180;
  return makePose({
    [b]: { x: 0, y: 0 },
    [a]: { x: 1, y: 0 },
    [c]: { x: Math.cos(rad), y: Math.sin(rad) },
  });
}

describe('compareToIdeal', () => {
  it('reports a joint inside its ideal range as in_range with zero deviation', () => {
    const tennis = SPORT_PROFILES.tennis;
    const elbow = tennis.joints[0]; // Serving Elbow 100–170
    const mid = (elbow.idealMin + elbow.idealMax) / 2; // 135
    const pose = poseWithAngle(elbow.a, elbow.b, elbow.c, mid);

    const dev = evaluateJointDeviation(pose, elbow)!;
    expect(dev.direction).toBe('in_range');
    expect(dev.deviation).toBe(0);
    expect(dev.signedDeviation).toBe(0);
    expect(dev.status).toBe('good');
    expect(dev.cue).toBe('');
  });

  it('flags an under-extended joint with a negative signed deviation', () => {
    const tennis = SPORT_PROFILES.tennis;
    const elbow = tennis.joints[0]; // 100–170
    const pose = poseWithAngle(elbow.a, elbow.b, elbow.c, 70); // 30 under min
    const dev = evaluateJointDeviation(pose, elbow)!;
    expect(dev.angle).toBe(70);
    expect(dev.direction).toBe('under');
    expect(dev.signedDeviation).toBe(-30);
    expect(dev.deviation).toBe(30);
    expect(dev.cue).toContain('extend');
  });

  it('flags an over-extended joint with a positive signed deviation', () => {
    const tennis = SPORT_PROFILES.tennis;
    const knee = tennis.joints[1]; // Lead Knee 130–165
    const pose = poseWithAngle(knee.a, knee.b, knee.c, 180); // 15 over max
    const dev = evaluateJointDeviation(pose, knee)!;
    expect(dev.direction).toBe('over');
    expect(dev.signedDeviation).toBe(15);
    expect(dev.deviation).toBe(15);
    expect(dev.cue).toContain('reduce');
  });

  it('skips joints with low-visibility landmarks', () => {
    const tennis = SPORT_PROFILES.tennis;
    const elbow = tennis.joints[0];
    const pose = poseWithAngle(elbow.a, elbow.b, elbow.c, 135);
    pose[elbow.b] = { ...pose[elbow.b], visibility: 0.1 };
    expect(evaluateJointDeviation(pose, elbow)).toBeNull();
  });

  it('sorts joints worst-first and surfaces the largest deviation', () => {
    // Build a single-joint scenario on disjoint landmarks so we can assert an
    // exact deviation, then verify the overall list is sorted worst-first.
    const tennis = SPORT_PROFILES.tennis;
    const elbow = tennis.joints[0]; // Serving Elbow 100–170, landmarks 12/14/16
    const pose = poseWithAngle(elbow.a, elbow.b, elbow.c, 60); // 40 under min

    const result: IdealComparison = compareToIdeal(pose, 'tennis');

    // overall list is sorted worst-first (descending deviation)
    for (let i = 1; i < result.joints.length; i++) {
      expect(result.joints[i - 1].deviation).toBeGreaterThanOrEqual(
        result.joints[i].deviation,
      );
    }

    // the explicitly-configured elbow is exactly 40° under and present
    const elbowDev = result.joints.find((d) => d.joint === elbow.name)!;
    expect(elbowDev.deviation).toBe(40);
    expect(elbowDev.direction).toBe('under');

    // worst slice is capped and ordered
    const top1 = compareToIdeal(pose, 'tennis', { worstN: 1 }).worst;
    expect(top1).toHaveLength(1);
    expect(top1[0].deviation).toBe(result.joints[0].deviation);
  });

  it('computes meanDeviation and inRangeCount across evaluated joints', () => {
    // All landmarks at origin -> every angle is 0 (degenerate but visible),
    // so every joint is "under" its min. Still deterministic.
    const pose = makePose({});
    const result = compareToIdeal(pose, 'generic');
    expect(result.evaluatedCount).toBe(SPORT_PROFILES.generic.joints.length);
    expect(result.meanDeviation).toBeGreaterThan(0);
    expect(result.inRangeCount).toBe(0);
  });

  it('falls back to the generic profile for an unknown sport', () => {
    const pose = makePose({});
    const result = compareToIdeal(pose, 'wat' as never);
    expect(result.sport).toBe('generic');
  });

  it('respects minDeviation when building the worst list', () => {
    const tennis = SPORT_PROFILES.tennis;
    const elbow = tennis.joints[0];
    const pose = poseWithAngle(elbow.a, elbow.b, elbow.c, 95); // 5 under min
    const result = compareToIdeal(pose, 'tennis', { minDeviation: 10 });
    // the elbow is only 5 out, below the 10° floor -> excluded from worst
    const elbowInWorst = result.worst.find((d) => d.joint === elbow.name);
    expect(elbowInWorst).toBeUndefined();
  });
});

// ── bestRep ───────────────────────────────────────────

function makeRep(index: number, peakSpeedKmh: number): Rep {
  const base = index * 1000;
  return {
    index,
    startMs: base,
    peakMs: base + 100,
    endMs: base + 200,
    peakSpeedKmh,
    startIndex: index * 10,
    peakIndex: index * 10 + 1,
    endIndex: index * 10 + 2,
  };
}

describe('bestRep', () => {
  const reps: Rep[] = [
    makeRep(0, 80),
    makeRep(1, 120),
    makeRep(2, 100),
  ];

  it('selects the fastest rep when no form scores are supplied', () => {
    const best = selectBestRep(reps);
    expect(best!.rep.index).toBe(1);
    expect(best!.peakSpeedKmh).toBe(120);
    expect(best!.formScore).toBeNull();
  });

  it('selectFastestRep ignores form entirely', () => {
    expect(selectFastestRep(reps)!.index).toBe(1);
  });

  it('blends speed and form so a slightly slower but cleaner rep can win', () => {
    // rep1 fastest (120) but sloppy form (40); rep2 a touch slower (100) but
    // near-perfect form (100). With heavy form weight, rep2 should win.
    const formScores = [
      { index: 0, formScore: 50 },
      { index: 1, formScore: 40 },
      { index: 2, formScore: 100 },
    ];
    const best = selectBestRep(reps, formScores, { speedWeight: 0.3 });
    expect(best!.rep.index).toBe(2);
  });

  it('keeps the fastest rep when speed weight dominates', () => {
    const formScores = [
      { index: 0, formScore: 50 },
      { index: 1, formScore: 40 },
      { index: 2, formScore: 100 },
    ];
    const best = selectBestRep(reps, formScores, { speedWeight: 0.9 });
    expect(best!.rep.index).toBe(1);
  });

  it('ranks reps deterministically with stable tie-breaking', () => {
    const tied: Rep[] = [makeRep(0, 100), makeRep(1, 100)];
    const ranked = scoreReps(tied);
    // equal score & speed -> lower index first
    expect(ranked.map((r) => r.rep.index)).toEqual([0, 1]);
  });

  it('selectTopReps returns at most N, highest score first', () => {
    const top = selectTopReps(reps, 2);
    expect(top).toHaveLength(2);
    expect(top[0].rep.index).toBe(1); // 120
    expect(top[1].rep.index).toBe(2); // 100
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score);
  });

  it('returns empty / null for empty input', () => {
    expect(scoreReps([])).toEqual([]);
    expect(selectBestRep([])).toBeNull();
    expect(selectTopReps([], 3)).toEqual([]);
    expect(selectFastestRep([])).toBeNull();
    expect(selectTopReps(reps, 0)).toEqual([]);
  });

  it('clamps out-of-range speedWeight without throwing', () => {
    const formScores = [{ index: 1, formScore: 100 }];
    expect(() => scoreReps(reps, formScores, { speedWeight: 5 })).not.toThrow();
    expect(() => scoreReps(reps, formScores, { speedWeight: -2 })).not.toThrow();
  });
});
