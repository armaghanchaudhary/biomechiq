// src/domain/services/compareToIdeal.ts
// Pure domain logic: compare a pose against a sport's ideal joint-angle ranges
// and surface the joints that are furthest out of range, for a "your form vs
// ideal" overlay or coaching prompt.
// PURE — no React, Expo, or vendor SDK imports.

import { Landmark, JointDef, Sport } from '../types';
import { SPORT_PROFILES } from '../sportProfiles';
import { computeJointAngle, classifyAngle } from './angleCalc';

/** Direction a joint angle sits relative to its ideal range. */
export type DeviationDirection = 'under' | 'over' | 'in_range';

/**
 * One joint's measured angle framed against its ideal range.
 */
export interface JointDeviation {
  /** Joint label (matches JointDef.name). */
  joint: string;
  /** Which side of the body the joint belongs to. */
  side: JointDef['side'];
  /** Measured angle in degrees. */
  angle: number;
  /** Ideal lower bound (degrees). */
  idealMin: number;
  /** Ideal upper bound (degrees). */
  idealMax: number;
  /**
   * Signed degrees outside the ideal range:
   *   < idealMin -> negative (angle - idealMin)
   *   > idealMax -> positive (angle - idealMax)
   *   in range   -> 0
   */
  signedDeviation: number;
  /** Absolute degrees outside the ideal range (0 when in range). */
  deviation: number;
  /** Which way the joint is out (or 'in_range'). */
  direction: DeviationDirection;
  /** Severity bucket from the shared classifier. */
  status: 'good' | 'warn' | 'info';
  /**
   * Short cue: which way to move the joint to get back into range.
   * Empty string when already in range.
   */
  cue: string;
}

/** Result of comparing a whole pose against a sport profile. */
export interface IdealComparison {
  sport: Sport;
  /** Every trackable joint with a confident angle, sorted worst-first. */
  joints: JointDeviation[];
  /**
   * The worst-N joints (largest deviation first), capped by `worstN`.
   * Convenience slice of `joints` for overlay/coaching consumers.
   */
  worst: JointDeviation[];
  /**
   * Mean absolute deviation (degrees) across all evaluated joints.
   * 0 when nothing could be measured.
   */
  meanDeviation: number;
  /** Count of joints that were inside their ideal range. */
  inRangeCount: number;
  /** Count of joints that were evaluated (had a confident angle). */
  evaluatedCount: number;
}

export interface CompareToIdealOptions {
  /** How many joints to surface in `worst`. Default 3. */
  worstN?: number;
  /**
   * Only include joints whose absolute deviation meets or exceeds this many
   * degrees in `worst`. Default 0 (include everything, sorted by deviation).
   */
  minDeviation?: number;
}

const DEFAULT_WORST_N = 3;

function describeCue(joint: JointDef, direction: DeviationDirection): string {
  if (direction === 'in_range') return '';
  // For most joints a larger angle == more extended/straighter.
  return direction === 'under'
    ? `extend ${joint.name} more`
    : `reduce ${joint.name} extension`;
}

/**
 * Evaluate a single joint against its ideal range. Returns null when the joint
 * cannot be measured confidently (missing/low-visibility landmarks).
 */
export function evaluateJointDeviation(
  landmarks: Landmark[],
  joint: JointDef,
): JointDeviation | null {
  const angle = computeJointAngle(landmarks, joint);
  if (angle === null) return null;

  let signedDeviation = 0;
  let direction: DeviationDirection = 'in_range';

  if (angle < joint.idealMin) {
    signedDeviation = angle - joint.idealMin; // negative
    direction = 'under';
  } else if (angle > joint.idealMax) {
    signedDeviation = angle - joint.idealMax; // positive
    direction = 'over';
  }

  return {
    joint: joint.name,
    side: joint.side,
    angle,
    idealMin: joint.idealMin,
    idealMax: joint.idealMax,
    signedDeviation,
    deviation: Math.abs(signedDeviation),
    direction,
    status: classifyAngle(angle, joint),
    cue: describeCue(joint, direction),
  };
}

/**
 * Compare a pose against a sport's ideal joint-angle ranges.
 *
 * Joints that cannot be measured confidently (missing or low-visibility
 * landmarks) are skipped. The returned `joints` are sorted worst-first
 * (largest deviation), with ties broken by joint order in the profile so the
 * output is stable.
 *
 * Deterministic and side-effect free.
 */
export function compareToIdeal(
  landmarks: Landmark[],
  sport: Sport,
  options: CompareToIdealOptions = {},
): IdealComparison {
  const worstN = options.worstN ?? DEFAULT_WORST_N;
  const minDeviation = options.minDeviation ?? 0;

  const profile = SPORT_PROFILES[sport] ?? SPORT_PROFILES.generic;

  const evaluated: JointDeviation[] = [];
  profile.joints.forEach((joint, order) => {
    const dev = evaluateJointDeviation(landmarks, joint);
    if (dev) {
      // attach original order for stable tie-breaking, stripped before return
      (dev as JointDeviation & { __order: number }).__order = order;
      evaluated.push(dev);
    }
  });

  const sorted = [...evaluated].sort((a, b) => {
    if (b.deviation !== a.deviation) return b.deviation - a.deviation;
    return (
      (a as JointDeviation & { __order: number }).__order -
      (b as JointDeviation & { __order: number }).__order
    );
  });

  // strip the internal sort key
  sorted.forEach((d) => {
    delete (d as Partial<JointDeviation & { __order: number }>).__order;
  });

  const inRangeCount = sorted.filter((d) => d.direction === 'in_range').length;
  const totalDeviation = sorted.reduce((sum, d) => sum + d.deviation, 0);
  const meanDeviation =
    sorted.length === 0 ? 0 : round(totalDeviation / sorted.length, 1);

  const worst = sorted
    .filter((d) => d.deviation >= minDeviation && d.direction !== 'in_range')
    .slice(0, worstN);

  return {
    sport: profile.sport,
    joints: sorted,
    worst,
    meanDeviation,
    inRangeCount,
    evaluatedCount: sorted.length,
  };
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
