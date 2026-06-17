// src/domain/services/speedConfidence.ts
// Pure domain logic: how much should we trust a single speed reading?
// PURE — no React, Expo, or vendor SDK imports.
//
// A pixel-displacement speed estimate degrades under three conditions that the
// camera can self-report or that we can proxy cheaply per frame:
//   1. Low/unstable frame rate  -> larger time deltas, coarser sampling.
//   2. Off-axis camera angle     -> object travels partly toward/away from the
//                                   lens, so on-screen pixel motion understates
//                                   true speed (foreshortening).
//   3. Motion blur               -> the object's centroid is smeared, so the
//                                   tracked position (and thus displacement) is
//                                   noisy.
// We fold these into a single 0..1 quality score and a label helper.

export interface SpeedConfidenceInput {
  /** Frames per second the reading was sampled at. */
  fps: number;
  /**
   * Estimated off-axis angle of the motion plane relative to the camera, in
   * degrees. 0 = motion is perfectly perpendicular to the lens (ideal);
   * 90 = motion is straight toward/away from the lens (un-measurable in 2D).
   */
  offAxisAngleDeg: number;
  /**
   * Motion-blur proxy in 0..1. 0 = crisp object edges; 1 = fully smeared.
   * Typically derived from object speed vs. exposure, or an edge-sharpness
   * metric on the detected bounding box.
   */
  motionBlur: number;
}

export interface SpeedConfidence {
  /** Overall trust score, 0..1. */
  score: number;
  /** Per-factor breakdown, each 0..1, for diagnostics / UI. */
  factors: {
    frameRate: number;
    cameraAngle: number;
    motionBlur: number;
  };
}

/** fps at or below this contributes no frame-rate confidence. */
const FPS_FLOOR = 15;
/** fps at or above this gives full frame-rate confidence. */
const FPS_CEIL = 60;

/** Off-axis angle (deg) at or beyond this is treated as un-measurable. */
const ANGLE_UNMEASURABLE_DEG = 75;

/** Default cutoff under which a reading should be flagged as 'estimated'. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Compute a 0..1 confidence/quality score for a speed reading.
 * Deterministic and side-effect free.
 */
export function computeSpeedConfidence(input: SpeedConfidenceInput): SpeedConfidence {
  const frameRate = frameRateFactor(input.fps);
  const cameraAngle = cameraAngleFactor(input.offAxisAngleDeg);
  const motionBlur = motionBlurFactor(input.motionBlur);

  // Multiplicative: any single failing dimension drags the whole reading down,
  // which matches reality — a perfectly framed but heavily-blurred reading is
  // still untrustworthy.
  const score = clamp01(frameRate * cameraAngle * motionBlur);

  return { score, factors: { frameRate, cameraAngle, motionBlur } };
}

/** Linear ramp from FPS_FLOOR (0) to FPS_CEIL (1). */
function frameRateFactor(fps: number): number {
  if (!isFinite(fps)) return 0;
  return clamp01((fps - FPS_FLOOR) / (FPS_CEIL - FPS_FLOOR));
}

/**
 * Confidence falls with off-axis angle. We use cos(angle) — the fraction of
 * true motion that projects onto the image plane — and zero it out past the
 * un-measurable threshold. |angle| is used so negative angles are symmetric.
 */
function cameraAngleFactor(angleDeg: number): number {
  if (!isFinite(angleDeg)) return 0;
  const a = Math.abs(angleDeg);
  if (a >= ANGLE_UNMEASURABLE_DEG) return 0;
  return clamp01(Math.cos((a * Math.PI) / 180));
}

/** More blur -> less confidence. Linear inverse of the 0..1 proxy. */
function motionBlurFactor(blur: number): number {
  if (!isFinite(blur)) return 0;
  return clamp01(1 - blur);
}

/**
 * Label a speed reading. When confidence is below the threshold the value is
 * not trustworthy enough to present as a hard number, so it's flagged
 * 'estimated'; otherwise 'measured'.
 */
export type SpeedReadingLabel = 'measured' | 'estimated';

export function labelSpeedReading(
  confidence: number,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): SpeedReadingLabel {
  return confidence >= threshold ? 'measured' : 'estimated';
}

/** Convenience: true when a reading should be shown as an estimate. */
export function isEstimated(
  confidence: number,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): boolean {
  return labelSpeedReading(confidence, threshold) === 'estimated';
}

function clamp01(n: number): number {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
