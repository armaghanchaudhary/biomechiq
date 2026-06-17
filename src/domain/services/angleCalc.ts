// src/domain/services/angleCalc.ts
// Joint angle math + form scoring. PURE domain service (no framework imports).

import { Landmark, JointDef, CoachingTip } from '../types';

/**
 * Calculate the angle at point B, formed by vectors BA and BC.
 * Returns degrees 0–180.
 */
export function angleBetweenPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const abX = a.x - b.x;
  const abY = a.y - b.y;
  const cbX = c.x - b.x;
  const cbY = c.y - b.y;

  const dot = abX * cbX + abY * cbY;
  const magAB = Math.sqrt(abX * abX + abY * abY);
  const magCB = Math.sqrt(cbX * cbX + cbY * cbY);

  if (magAB === 0 || magCB === 0) return 0;

  const cosTheta = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return Math.round((Math.acos(cosTheta) * 180) / Math.PI);
}

/**
 * Compute angle for a given joint definition from pose landmarks array
 */
export function computeJointAngle(
  landmarks: Landmark[],
  joint: JointDef
): number | null {
  const a = landmarks[joint.a];
  const b = landmarks[joint.b];
  const c = landmarks[joint.c];

  if (!a || !b || !c) return null;

  // Only compute if all points are visible enough
  if (
    (a.visibility ?? 1) < 0.4 ||
    (b.visibility ?? 1) < 0.4 ||
    (c.visibility ?? 1) < 0.4
  ) {
    return null;
  }

  return angleBetweenPoints(a, b, c);
}

/**
 * Classify an angle as good, warn, or info
 */
export function classifyAngle(
  angle: number,
  joint: JointDef
): 'good' | 'warn' | 'info' {
  if (angle >= joint.idealMin && angle <= joint.idealMax) return 'good';
  if (
    angle < joint.idealMin - 15 ||
    angle > joint.idealMax + 15
  ) return 'warn';
  return 'info';
}

/**
 * Generate coaching feedback for a set of joint angles
 */
export function generateJointFeedback(
  landmarks: Landmark[],
  joints: JointDef[]
): CoachingTip[] {
  const tips: CoachingTip[] = [];

  for (const joint of joints) {
    const angle = computeJointAngle(landmarks, joint);
    if (angle === null) continue;

    const status = classifyAngle(angle, joint);

    if (status === 'warn') {
      if (angle < joint.idealMin) {
        tips.push({
          severity: 'warn',
          message: `${joint.name}: extend more (${angle}° → target ${joint.idealMin}–${joint.idealMax}°)`,
          joint: joint.name,
        });
      } else {
        tips.push({
          severity: 'warn',
          message: `${joint.name}: reduce extension (${angle}° → target ${joint.idealMin}–${joint.idealMax}°)`,
          joint: joint.name,
        });
      }
    } else if (status === 'good') {
      tips.push({
        severity: 'good',
        message: `${joint.name}: great angle (${angle}°)`,
        joint: joint.name,
      });
    }
  }

  return tips.slice(0, 4); // max 4 tips on screen
}

/**
 * Compute a form score 0–100 based on how many joints are in ideal range
 */
export function computeFormScore(
  landmarks: Landmark[],
  joints: JointDef[]
): number {
  let totalWeight = 0;
  let goodWeight = 0;

  for (const joint of joints) {
    const angle = computeJointAngle(landmarks, joint);
    if (angle === null) continue;

    totalWeight += 1;
    const status = classifyAngle(angle, joint);

    if (status === 'good') goodWeight += 1;
    else if (status === 'info') goodWeight += 0.5;
  }

  if (totalWeight === 0) return 0;
  return Math.round((goodWeight / totalWeight) * 100);
}
