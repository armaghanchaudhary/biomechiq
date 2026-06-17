// test/repDetector.test.ts
import { describe, it, expect } from 'vitest';
import { SpeedSample } from '@/domain';
import {
  RepDetector,
  detectReps,
  repConfigForSport,
} from '@/domain/services/repDetector';

// ── Synthetic timeseries helpers ──────────────────────

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

describe('RepDetector', () => {
  it('returns no reps for an empty or single-sample series', () => {
    expect(new RepDetector('generic').detect([])).toEqual([]);
    expect(new RepDetector('generic').detect(series([50]))).toEqual([]);
  });

  it('detects a single rep and reports correct boundaries + peak', () => {
    // Quiet head + one rep + quiet tail.
    const speeds = [0, 0, 0, ...rep(60), 0, 0];
    const samples = series(speeds);

    const reps = detectReps(samples, 'generic');

    expect(reps).toHaveLength(1);
    const r = reps[0];
    expect(r.index).toBe(0);
    expect(r.peakSpeedKmh).toBe(60);

    // Onset: first sample above the generic onset (15). rep() ramps 0,30,60 —
    // 30 (index 5 overall) is the first > 15.
    const onsetIdx = speeds.findIndex((s) => s > 15);
    expect(r.startIndex).toBe(onsetIdx);
    expect(r.startMs).toBe(samples[onsetIdx].timestamp);

    // Peak sample.
    expect(samples[r.peakIndex].speedKmh).toBe(60);

    // End: first sample after the peak that drops below release (5) — the 0.
    expect(samples[r.endIndex].speedKmh).toBeLessThan(5);
    expect(r.startMs).toBeLessThan(r.peakMs);
    expect(r.peakMs).toBeLessThan(r.endMs);
  });

  it('segments three distinct reps with monotone indices', () => {
    // ~660ms of rest between reps — clears the 500ms generic cooldown at 30fps.
    const gap = new Array(20).fill(0) as number[];
    const speeds = [
      ...gap,
      ...rep(40),
      ...gap,
      ...rep(70),
      ...gap,
      ...rep(55),
      ...gap,
    ];
    const samples = series(speeds);

    const reps = detectReps(samples, 'generic');

    expect(reps).toHaveLength(3);
    expect(reps.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(reps.map((r) => r.peakSpeedKmh)).toEqual([40, 70, 55]);

    // Reps are ordered and non-overlapping.
    for (let i = 1; i < reps.length; i++) {
      expect(reps[i].startMs).toBeGreaterThan(reps[i - 1].endMs);
    }
  });

  it('merges two pulses separated by less than the cooldown into one rep', () => {
    // Two peaks with only a single low frame between them — well inside the
    // 500ms generic cooldown — should collapse to one rep keeping the higher peak.
    const speeds = [0, 0, 30, 50, 0, 60, 30, 0, 0];
    const samples = series(speeds);

    const reps = detectReps(samples, 'generic');

    expect(reps).toHaveLength(1);
    expect(reps[0].peakSpeedKmh).toBe(60);
  });

  it('ignores sub-threshold noise that never reaches a real peak', () => {
    // Wobble below the generic onset (15) the whole time.
    const speeds = [0, 5, 10, 8, 12, 6, 0, 9, 11, 0];
    const reps = detectReps(series(speeds), 'generic');
    expect(reps).toHaveLength(0);
  });

  it('closes an open rep when the session ends mid-action', () => {
    // Ramps up and stays high until the series ends — no release frame.
    const speeds = [0, 0, 30, 50, 60, 65, 70];
    const samples = series(speeds);

    const reps = detectReps(samples, 'generic');

    expect(reps).toHaveLength(1);
    expect(reps[0].peakSpeedKmh).toBe(70);
    expect(reps[0].endIndex).toBe(samples.length - 1);
  });

  it('applies per-sport thresholds: a slow pulse is a rep for basketball but not cricket', () => {
    // Peak 20 km/h: above basketball onset (10), below cricket onset (30).
    const speeds = [0, 0, 8, 20, 8, 0, 0];
    const samples = series(speeds);

    expect(detectReps(samples, 'basketball')).toHaveLength(1);
    expect(detectReps(samples, 'cricket')).toHaveLength(0);
  });

  it('honours caller overrides over the sport defaults', () => {
    const cfg = repConfigForSport('generic', { onsetSpeedKmh: 5 });
    expect(cfg.onsetSpeedKmh).toBe(5);

    const speeds = [0, 8, 12, 8, 0]; // peak 12, below default generic onset 15
    const reps = new RepDetector('generic', { onsetSpeedKmh: 5, minPeakSpeedKmh: 5 }).detect(
      series(speeds),
    );
    expect(reps).toHaveLength(1);
    expect(reps[0].peakSpeedKmh).toBe(12);
  });

  it('drops candidates shorter than minDurationMs', () => {
    // One-frame spike: peak appears for a single frame then gone. With a high
    // minDurationMs it should be rejected.
    const speeds = [0, 0, 50, 0, 0];
    const reps = new RepDetector('generic', { minDurationMs: 1000 }).detect(series(speeds));
    expect(reps).toHaveLength(0);
  });
});
