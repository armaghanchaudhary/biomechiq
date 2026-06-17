// test/analyzeSpeed.test.ts
import { describe, it, expect } from 'vitest';
import { SpeedSample, Landmark, PoseLandmark } from '@/domain';
import {
  analyzeSpeed,
  makeAnalyzeSpeed,
  type SpeedAnalysis,
} from '@/application/analyzeSpeed';

// ── Synthetic timeseries helpers (mirror repDetector.test.ts) ─────────

const FRAME_MS = 33; // ~30 fps

/** Build a sample array from a list of speeds, evenly spaced at FRAME_MS. */
function series(speeds: number[], startMs = 0): SpeedSample[] {
  return speeds.map((speedKmh, i) => ({
    timestamp: startMs + i * FRAME_MS,
    speedKmh,
    objectX: 0.5,
    objectY: 0.5,
  }));
}

/** A single bell-shaped rep: rest → ramp up → peak → ramp down → rest. */
function rep(peak: number): number[] {
  return [0, 0, peak * 0.5, peak, peak * 0.5, 0, 0];
}

const gap = new Array(20).fill(0) as number[];

/**
 * Build a full set of 33 landmarks all sitting at a single point. A degenerate
 * pose makes joint angles unmeasurable, which is fine for the "without ideal
 * reference" path; for the "with reference" path we just need a non-empty array
 * so compareToIdeal actually runs against the sport profile.
 */
function flatPose(): Landmark[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
}

/** A pose with a clean right-elbow bend so at least one joint is measurable. */
function poseWithElbow(): Landmark[] {
  const lm = flatPose();
  // Right shoulder — right elbow — right wrist forming a clear angle.
  lm[PoseLandmark.RIGHT_SHOULDER] = { x: 0.4, y: 0.4, z: 0, visibility: 1 };
  lm[PoseLandmark.RIGHT_ELBOW] = { x: 0.5, y: 0.5, z: 0, visibility: 1 };
  lm[PoseLandmark.RIGHT_WRIST] = { x: 0.6, y: 0.4, z: 0, visibility: 1 };
  return lm;
}

describe('analyzeSpeed', () => {
  it('handles an empty session: no reps, zeroed peaks, null optional results', () => {
    const result = analyzeSpeed({ samples: [], sport: 'generic' });

    expect(result.sampleCount).toBe(0);
    expect(result.peakSpeedKmh).toBe(0);
    expect(result.avgSpeedKmh).toBe(0);
    expect(result.reps).toEqual([]);
    expect(result.repCount).toBe(0);
    expect(result.bestRep).toBeNull();
    expect(result.confidence).toBeNull();
    expect(result.idealComparison).toBeNull();

    // peak (0) vs default personal best (0) — no prior best, percent undefined.
    expect(result.relativeSpeed.current).toBe(0);
    expect(result.relativeSpeed.reference).toBe(0);
    expect(result.relativeSpeed.percent).toBeNull();
    expect(result.relativeSpeed.isNewBest).toBe(false);
  });

  it('analyses a single clean rep and selects it as the best rep', () => {
    const samples = series([0, 0, 0, ...rep(60), 0, 0]);

    const result = analyzeSpeed({ samples, sport: 'generic', personalBestKmh: 50 });

    expect(result.repCount).toBe(1);
    expect(result.peakSpeedKmh).toBe(60);
    expect(result.bestRep).not.toBeNull();
    expect(result.bestRep!.rep.index).toBe(0);
    expect(result.bestRep!.peakSpeedKmh).toBe(60);

    // 60 km/h peak beats the 50 km/h prior best.
    expect(result.relativeSpeed.delta).toBe(10);
    expect(result.relativeSpeed.direction).toBe('up');
    expect(result.relativeSpeed.isNewBest).toBe(true);
  });

  it('picks the clearly fastest rep among several', () => {
    const samples = series([
      ...gap,
      ...rep(40),
      ...gap,
      ...rep(70),
      ...gap,
      ...rep(55),
      ...gap,
    ]);

    const result = analyzeSpeed({ samples, sport: 'generic' });

    expect(result.repCount).toBe(3);
    expect(result.reps.map((r) => r.peakSpeedKmh)).toEqual([40, 70, 55]);
    expect(result.peakSpeedKmh).toBe(70);

    // With no form scores, best rep ranks on speed alone -> the 70 km/h rep.
    expect(result.bestRep!.peakSpeedKmh).toBe(70);
    expect(result.bestRep!.rep.index).toBe(1);
  });

  it('reports low confidence for sparse / noisy capture context', () => {
    const samples = series([0, 0, ...rep(40), 0, 0]);

    const result = analyzeSpeed({
      samples,
      sport: 'generic',
      confidence: {
        fps: 12, // below the 15 fps floor -> zero frame-rate factor
        offAxisAngleDeg: 60, // steeply off-axis
        motionBlur: 0.8, // heavily smeared
      },
    });

    expect(result.confidence).not.toBeNull();
    expect(result.confidence!.score).toBeLessThan(0.5); // estimated, not measured
    expect(result.confidence!.factors.frameRate).toBe(0);

    // A clean, well-framed capture should score far higher for contrast.
    const clean = analyzeSpeed({
      samples,
      sport: 'generic',
      confidence: { fps: 60, offAxisAngleDeg: 0, motionBlur: 0 },
    });
    expect(clean.confidence!.score).toBeGreaterThan(result.confidence!.score);
    expect(clean.confidence!.score).toBeGreaterThanOrEqual(0.5);
  });

  it('includes an ideal comparison only when a pose is supplied', () => {
    const samples = series([0, 0, ...rep(60), 0, 0]);

    // Without a pose: no ideal reference for this analysis.
    const without = analyzeSpeed({ samples, sport: 'tennis' });
    expect(without.idealComparison).toBeNull();

    // With a pose: compareToIdeal runs against the sport profile.
    const withPose = analyzeSpeed({
      samples,
      sport: 'tennis',
      idealPose: poseWithElbow(),
    });
    expect(withPose.idealComparison).not.toBeNull();
    expect(withPose.idealComparison!.sport).toBe('tennis');
    expect(withPose.idealComparison!.evaluatedCount).toBeGreaterThan(0);
  });

  it('makeAnalyzeSpeed returns a callable that matches the pure function', () => {
    const run = makeAnalyzeSpeed();
    const samples = series([0, 0, ...rep(45), 0, 0]);

    const viaFactory: SpeedAnalysis = run({ samples, sport: 'generic' });
    const viaPure = analyzeSpeed({ samples, sport: 'generic' });

    expect(viaFactory).toEqual(viaPure);
  });
});
