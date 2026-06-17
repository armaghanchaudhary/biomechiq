// test/workstreamC.test.ts
// Deterministic tests for Workstream C: calibration math + speed confidence +
// relative-speed framing.

import { describe, it, expect } from 'vitest';
import {
  ReferenceObjectCalibration,
} from '@/adapters/calibration/referenceObjectCalibration';
import {
  computeSpeedConfidence,
  labelSpeedReading,
  isEstimated,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from '@/domain/services/speedConfidence';
import {
  compareSpeed,
  compareToPrevious,
  compareToPersonalBest,
  formatRelativeHeadline,
} from '@/domain/services/relativeSpeed';

describe('ReferenceObjectCalibration', () => {
  const cal = new ReferenceObjectCalibration();

  it('exposes a stable id and base confidence', () => {
    expect(cal.id).toBe('reference-object');
    expect(cal.confidence).toBeGreaterThan(0);
    expect(cal.confidence).toBeLessThanOrEqual(1);
  });

  it('computes metersPerPixel = realMeters / pixelWidth', () => {
    // A 0.24m basketball spanning 120px -> 0.002 m/px.
    const data = cal.compute({
      referencePixelWidth: 120,
      referenceRealMeters: 0.24,
      frameWidth: 1920,
      frameHeight: 1080,
    });
    expect(data.metersPerPixel).toBeCloseTo(0.002, 6);
    expect(data.frameWidth).toBe(1920);
    expect(data.frameHeight).toBe(1080);
    expect(data.referencePixelWidth).toBe(120);
    expect(data.referenceRealMeters).toBe(0.24);
  });

  it('scales linearly: doubling pixel width halves m/px', () => {
    const a = cal.compute({ referencePixelWidth: 100, referenceRealMeters: 1, frameWidth: 800, frameHeight: 600 });
    const b = cal.compute({ referencePixelWidth: 200, referenceRealMeters: 1, frameWidth: 800, frameHeight: 600 });
    expect(a.metersPerPixel).toBeCloseTo(b.metersPerPixel * 2, 9);
  });

  it('rejects non-positive / non-finite inputs', () => {
    const base = { referencePixelWidth: 100, referenceRealMeters: 1, frameWidth: 800, frameHeight: 600 };
    expect(() => cal.compute({ ...base, referencePixelWidth: 0 })).toThrow(RangeError);
    expect(() => cal.compute({ ...base, referenceRealMeters: -1 })).toThrow(RangeError);
    expect(() => cal.compute({ ...base, frameWidth: 0 })).toThrow(RangeError);
    expect(() => cal.compute({ ...base, frameHeight: NaN })).toThrow(RangeError);
  });

  it('penalises confidence for tiny reference objects', () => {
    const big = cal.confidenceFor({ referencePixelWidth: 80, referenceRealMeters: 0.24, frameWidth: 1920, frameHeight: 1080 });
    const small = cal.confidenceFor({ referencePixelWidth: 10, referenceRealMeters: 0.24, frameWidth: 1920, frameHeight: 1080 });
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(cal.confidence);
    expect(small).toBeGreaterThan(0);
  });

  it('honours custom id and base confidence', () => {
    const custom = new ReferenceObjectCalibration({ id: 'court-line', baseConfidence: 0.9 });
    expect(custom.id).toBe('court-line');
    expect(custom.confidence).toBeCloseTo(0.9, 9);
  });
});

describe('computeSpeedConfidence', () => {
  it('returns ~1 for ideal conditions (high fps, perpendicular, crisp)', () => {
    const { score, factors } = computeSpeedConfidence({ fps: 60, offAxisAngleDeg: 0, motionBlur: 0 });
    expect(score).toBeCloseTo(1, 6);
    expect(factors.frameRate).toBeCloseTo(1, 6);
    expect(factors.cameraAngle).toBeCloseTo(1, 6);
    expect(factors.motionBlur).toBeCloseTo(1, 6);
  });

  it('zeroes out at or below the fps floor', () => {
    const { score, factors } = computeSpeedConfidence({ fps: 15, offAxisAngleDeg: 0, motionBlur: 0 });
    expect(factors.frameRate).toBe(0);
    expect(score).toBe(0);
  });

  it('drops to zero at the un-measurable camera angle', () => {
    const { factors } = computeSpeedConfidence({ fps: 60, offAxisAngleDeg: 80, motionBlur: 0 });
    expect(factors.cameraAngle).toBe(0);
  });

  it('camera angle uses cosine projection', () => {
    const { factors } = computeSpeedConfidence({ fps: 60, offAxisAngleDeg: 60, motionBlur: 0 });
    expect(factors.cameraAngle).toBeCloseTo(Math.cos((60 * Math.PI) / 180), 6); // 0.5
  });

  it('full blur kills confidence regardless of other factors', () => {
    const { score, factors } = computeSpeedConfidence({ fps: 60, offAxisAngleDeg: 0, motionBlur: 1 });
    expect(factors.motionBlur).toBe(0);
    expect(score).toBe(0);
  });

  it('is multiplicative across factors', () => {
    const r = computeSpeedConfidence({ fps: 37.5, offAxisAngleDeg: 60, motionBlur: 0.5 });
    // fps factor: (37.5-15)/(60-15)=0.5 ; angle: 0.5 ; blur: 0.5 => 0.125
    expect(r.score).toBeCloseTo(0.125, 6);
  });

  it('clamps non-finite inputs to zero', () => {
    expect(computeSpeedConfidence({ fps: NaN, offAxisAngleDeg: 0, motionBlur: 0 }).score).toBe(0);
    expect(computeSpeedConfidence({ fps: 60, offAxisAngleDeg: Infinity, motionBlur: 0 }).score).toBe(0);
  });
});

describe('labelSpeedReading / isEstimated', () => {
  it('labels below threshold as estimated', () => {
    expect(labelSpeedReading(0.2)).toBe('estimated');
    expect(isEstimated(0.2)).toBe(true);
  });

  it('labels at or above threshold as measured', () => {
    expect(labelSpeedReading(DEFAULT_CONFIDENCE_THRESHOLD)).toBe('measured');
    expect(labelSpeedReading(0.9)).toBe('measured');
    expect(isEstimated(0.9)).toBe(false);
  });

  it('respects a custom threshold', () => {
    expect(labelSpeedReading(0.6, 0.8)).toBe('estimated');
    expect(labelSpeedReading(0.85, 0.8)).toBe('measured');
  });
});

describe('relativeSpeed', () => {
  it('computes delta, percent and direction (up)', () => {
    const r = compareSpeed(112, 100);
    expect(r.delta).toBe(12);
    expect(r.percent).toBeCloseTo(12, 9);
    expect(r.direction).toBe('up');
  });

  it('computes direction down with negative delta', () => {
    const r = compareSpeed(90, 100);
    expect(r.delta).toBe(-10);
    expect(r.percent).toBeCloseTo(-10, 9);
    expect(r.direction).toBe('down');
  });

  it('reports same when equal', () => {
    const r = compareSpeed(100, 100);
    expect(r.delta).toBe(0);
    expect(r.direction).toBe('same');
  });

  it('returns null percent against a zero reference', () => {
    const r = compareSpeed(50, 0);
    expect(r.percent).toBeNull();
    expect(r.direction).toBe('up');
  });

  it('compareToPrevious is an alias of compareSpeed', () => {
    expect(compareToPrevious(110, 100)).toEqual(compareSpeed(110, 100));
  });

  it('flags a new personal best only when strictly faster', () => {
    expect(compareToPersonalBest(120, 100).isNewBest).toBe(true);
    expect(compareToPersonalBest(100, 100).isNewBest).toBe(false);
    expect(compareToPersonalBest(95, 100).isNewBest).toBe(false);
  });

  it('formats a relative headline with sign and percent', () => {
    const r = compareToPersonalBest(112.4, 100);
    expect(formatRelativeHeadline(r, 'best')).toBe('+12.4 km/h (+12.4%) vs best');
  });

  it('formats a tie headline', () => {
    expect(formatRelativeHeadline(compareSpeed(100, 100), 'best')).toBe('matched your best');
  });

  it('omits percent in headline when reference is zero', () => {
    expect(formatRelativeHeadline(compareSpeed(20, 0), 'last')).toBe('+20 km/h vs last');
  });
});
