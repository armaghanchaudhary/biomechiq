// test/calibrationConfidence.edge.test.ts
// Edge cases for ReferenceObjectCalibration.{compute,confidenceFor} and the pure
// computeSpeedConfidence/labelSpeedReading domain helpers: zero/negative/NaN
// inputs, tiny reference objects, low frame rate and off-axis angles all push
// confidence toward 0 and flip the reading label to 'estimated'.

import { describe, it, expect } from 'vitest';
import { ReferenceObjectCalibration } from '@/adapters/calibration/referenceObjectCalibration';
import type { CalibrationInput } from '@/ports';
import {
  computeSpeedConfidence,
  labelSpeedReading,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from '@/domain';

function input(overrides: Partial<CalibrationInput> = {}): CalibrationInput {
  return {
    referencePixelWidth: 100,
    referenceRealMeters: 0.2286,
    frameWidth: 1920,
    frameHeight: 1080,
    ...overrides,
  };
}

describe('ReferenceObjectCalibration.compute', () => {
  const cal = new ReferenceObjectCalibration();

  it('derives metersPerPixel = realMeters / pixelWidth on a valid measurement', () => {
    const data = cal.compute(input({ referencePixelWidth: 200, referenceRealMeters: 0.4 }));
    expect(data.metersPerPixel).toBeCloseTo(0.002, 10);
    expect(data.frameWidth).toBe(1920);
    expect(data.frameHeight).toBe(1080);
  });

  it('throws RangeError when referencePixelWidth is zero', () => {
    expect(() => cal.compute(input({ referencePixelWidth: 0 }))).toThrow(RangeError);
  });

  it('throws RangeError when referencePixelWidth is negative', () => {
    expect(() => cal.compute(input({ referencePixelWidth: -10 }))).toThrow(RangeError);
  });

  it('throws RangeError when referenceRealMeters is non-positive', () => {
    expect(() => cal.compute(input({ referenceRealMeters: 0 }))).toThrow(RangeError);
    expect(() => cal.compute(input({ referenceRealMeters: -1 }))).toThrow(RangeError);
  });

  it('throws RangeError for non-finite frame dimensions', () => {
    expect(() => cal.compute(input({ frameWidth: 0 }))).toThrow(RangeError);
    expect(() => cal.compute(input({ frameHeight: Number.NaN }))).toThrow(RangeError);
  });
});

describe('ReferenceObjectCalibration.confidenceFor', () => {
  it('returns 0 for zero/negative/NaN pixel widths', () => {
    const cal = new ReferenceObjectCalibration();
    expect(cal.confidenceFor(input({ referencePixelWidth: 0 }))).toBe(0);
    expect(cal.confidenceFor(input({ referencePixelWidth: -5 }))).toBe(0);
    expect(cal.confidenceFor(input({ referencePixelWidth: Number.NaN }))).toBe(0);
  });

  it('penalises a tiny reference object below the reliable-pixel floor', () => {
    const cal = new ReferenceObjectCalibration({ baseConfidence: 0.8 });
    // 10px of a 40px floor -> sizeFactor 0.25 -> 0.8 * 0.25 = 0.2
    const small = cal.confidenceFor(input({ referencePixelWidth: 10 }));
    expect(small).toBeCloseTo(0.2, 10);
    expect(small).toBeLessThan(DEFAULT_CONFIDENCE_THRESHOLD);
  });

  it('reaches the base confidence once the object is large enough', () => {
    const cal = new ReferenceObjectCalibration({ baseConfidence: 0.7 });
    // >= 40px -> sizeFactor clamps to 1 -> equals base confidence.
    expect(cal.confidenceFor(input({ referencePixelWidth: 200 }))).toBeCloseTo(0.7, 10);
  });

  it('clamps the constructor baseConfidence into 0..1', () => {
    expect(new ReferenceObjectCalibration({ baseConfidence: 5 }).confidence).toBe(1);
    expect(new ReferenceObjectCalibration({ baseConfidence: -2 }).confidence).toBe(0);
  });
});

describe('computeSpeedConfidence edge cases', () => {
  it('low fps drags the score to 0 and the label to estimated', () => {
    const { score, factors } = computeSpeedConfidence({
      fps: 15, // at the floor -> 0 contribution
      offAxisAngleDeg: 0,
      motionBlur: 0,
    });
    expect(factors.frameRate).toBe(0);
    expect(score).toBe(0);
    expect(labelSpeedReading(score)).toBe('estimated');
  });

  it('an off-axis angle past the un-measurable threshold zeroes the score', () => {
    const { score, factors } = computeSpeedConfidence({
      fps: 60,
      offAxisAngleDeg: 80, // >= 75 -> un-measurable
      motionBlur: 0,
    });
    expect(factors.cameraAngle).toBe(0);
    expect(score).toBe(0);
    expect(labelSpeedReading(score)).toBe('estimated');
  });

  it('treats negative angles symmetrically (cosine of |angle|)', () => {
    const pos = computeSpeedConfidence({ fps: 60, offAxisAngleDeg: 45, motionBlur: 0 });
    const neg = computeSpeedConfidence({ fps: 60, offAxisAngleDeg: -45, motionBlur: 0 });
    expect(neg.factors.cameraAngle).toBeCloseTo(pos.factors.cameraAngle, 12);
    expect(neg.factors.cameraAngle).toBeCloseTo(Math.cos(Math.PI / 4), 12);
  });

  it('non-finite inputs collapse every factor to 0', () => {
    const { score, factors } = computeSpeedConfidence({
      fps: Number.NaN,
      offAxisAngleDeg: Number.POSITIVE_INFINITY,
      motionBlur: Number.NaN,
    });
    expect(factors).toEqual({ frameRate: 0, cameraAngle: 0, motionBlur: 0 });
    expect(score).toBe(0);
  });

  it('full motion blur kills confidence even with perfect fps and angle', () => {
    const { score, factors } = computeSpeedConfidence({
      fps: 60,
      offAxisAngleDeg: 0,
      motionBlur: 1,
    });
    expect(factors.frameRate).toBe(1);
    expect(factors.cameraAngle).toBe(1);
    expect(factors.motionBlur).toBe(0);
    expect(score).toBe(0);
  });

  it('an ideal reading scores 1 and labels measured', () => {
    const { score } = computeSpeedConfidence({ fps: 60, offAxisAngleDeg: 0, motionBlur: 0 });
    expect(score).toBe(1);
    expect(labelSpeedReading(score)).toBe('measured');
  });

  it('labelSpeedReading uses the default threshold boundary inclusively', () => {
    expect(labelSpeedReading(DEFAULT_CONFIDENCE_THRESHOLD)).toBe('measured');
    expect(labelSpeedReading(DEFAULT_CONFIDENCE_THRESHOLD - 0.0001)).toBe('estimated');
  });
});
