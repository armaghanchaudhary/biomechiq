// src/application/analyzeSpeed.ts
// Use case: AnalyzeSpeed. Produces a rich per-session speed analysis by
// COMPOSING existing pure domain services — it owns no biomechanics logic of
// its own, it only orchestrates and aggregates.
//
// Composes:
//   - detectReps            -> segment the session into reps
//   - selectBestRep         -> pick the highlight rep
//   - compareToPersonalBest -> rate the session peak vs a reference
//   - computeSpeedConfidence-> how much to trust the readings
//   - compareToIdeal        -> form vs the sport's ideal joint angles
//
// Depends only on @/domain (pure). No ports are required for this use case
// because every input is plain data, but it follows the make<UseCase>(deps)
// factory style so it composes uniformly with the rest of the application layer.

import {
  type SpeedSample,
  type Sport,
  type Landmark,
  type Rep,
  type ScoredRep,
  type RepFormScore,
  type RepDetectorConfig,
  type PersonalBestComparison,
  type SpeedConfidence,
  type SpeedConfidenceInput,
  type IdealComparison,
  type CompareToIdealOptions,
  detectReps,
  selectBestRep,
  compareToPersonalBest,
  computeSpeedConfidence,
  compareToIdeal,
} from '@/domain';

/**
 * Inputs for a single-session speed analysis. Only `samples` and `sport` are
 * required; the rest supply context that lives outside the SpeedSample stream.
 */
export interface AnalyzeSpeedInput {
  /** Ordered (ascending timestamp) speed samples for the session. */
  samples: SpeedSample[];
  /** Sport — drives rep thresholds and the ideal joint-angle reference. */
  sport: Sport;
  /**
   * Reference speed (km/h) to rate this session's peak against, e.g. the
   * athlete's prior personal best. Defaults to 0 (no prior best) so a first-ever
   * session is always framed as a new best.
   */
  personalBestKmh?: number;
  /**
   * Per-rep form scores (keyed by Rep.index) to fold into best-rep selection.
   * Omit when form was never computed — best rep then ranks on speed alone.
   */
  formScores?: RepFormScore[];
  /**
   * Pose to compare against the sport's ideal joint angles (typically the best
   * rep's peak frame). Omit to skip the form-vs-ideal comparison entirely
   * (a sport "without an ideal reference" for this analysis).
   */
  idealPose?: Landmark[];
  /**
   * Per-sample landmark frames (same length/order as `samples`), passed through
   * to the rep detector for future landmark-driven refinement.
   */
  landmarks?: (Landmark[] | null)[];
  /** Capture/measurement context driving the confidence score. */
  confidence?: SpeedConfidenceInput;
  /** Overrides for the per-sport rep-detection thresholds. */
  repConfig?: Partial<RepDetectorConfig>;
  /** Options forwarded to compareToIdeal (worstN, minDeviation). */
  idealOptions?: CompareToIdealOptions;
}

/**
 * Aggregated, typed result of a per-session speed analysis. Each field reuses
 * the corresponding domain service's own return type verbatim.
 */
export interface SpeedAnalysis {
  sport: Sport;
  /** Number of samples analysed. */
  sampleCount: number;
  /** Peak speed (km/h) across all samples, or 0 when there are none. */
  peakSpeedKmh: number;
  /** Mean speed (km/h) across all samples, or 0 when there are none. */
  avgSpeedKmh: number;
  /** Every detected rep, in order. */
  reps: Rep[];
  /** Convenience: reps.length. */
  repCount: number;
  /** The highlight rep, or null when no reps were detected. */
  bestRep: ScoredRep | null;
  /** Session peak framed against the supplied reference / personal best. */
  relativeSpeed: PersonalBestComparison;
  /** How much to trust the readings, or null when no context was supplied. */
  confidence: SpeedConfidence | null;
  /**
   * Form vs the sport's ideal joint angles, or null when no pose was supplied
   * (sport "without an ideal reference" for this analysis).
   */
  idealComparison: IdealComparison | null;
}

export type AnalyzeSpeed = (input: AnalyzeSpeedInput) => SpeedAnalysis;

/** Peak speed (km/h) across the samples; 0 for an empty series. */
function peakOf(samples: SpeedSample[]): number {
  let peak = 0;
  for (const s of samples) {
    if (s.speedKmh > peak) peak = s.speedKmh;
  }
  return peak;
}

/** Mean speed (km/h) across the samples; 0 for an empty series. */
function avgOf(samples: SpeedSample[]): number {
  if (samples.length === 0) return 0;
  const total = samples.reduce((sum, s) => sum + s.speedKmh, 0);
  return total / samples.length;
}

/**
 * Pure use case: analyse a session's speed timeseries by composing domain
 * services. Deterministic and side-effect free.
 */
export function analyzeSpeed(input: AnalyzeSpeedInput): SpeedAnalysis {
  const {
    samples,
    sport,
    personalBestKmh = 0,
    formScores = [],
    idealPose,
    landmarks,
    confidence,
    repConfig,
    idealOptions,
  } = input;

  const reps = detectReps(samples, sport, repConfig, landmarks);
  const bestRep = selectBestRep(reps, formScores);

  const peakSpeedKmh = peakOf(samples);
  const relativeSpeed = compareToPersonalBest(peakSpeedKmh, personalBestKmh);

  const confidenceResult = confidence
    ? computeSpeedConfidence(confidence)
    : null;

  const idealComparison = idealPose
    ? compareToIdeal(idealPose, sport, idealOptions)
    : null;

  return {
    sport,
    sampleCount: samples.length,
    peakSpeedKmh,
    avgSpeedKmh: avgOf(samples),
    reps,
    repCount: reps.length,
    bestRep,
    relativeSpeed,
    confidence: confidenceResult,
    idealComparison,
  };
}

/**
 * Factory in the make<UseCase>(deps) style. AnalyzeSpeed needs no injected
 * ports — every input is plain data — so deps is empty, but the factory keeps
 * the application layer uniform and leaves room for future injected policy.
 */
export function makeAnalyzeSpeed(): AnalyzeSpeed {
  return (input: AnalyzeSpeedInput): SpeedAnalysis => analyzeSpeed(input);
}
