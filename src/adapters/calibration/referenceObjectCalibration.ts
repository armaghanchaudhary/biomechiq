// src/adapters/calibration/referenceObjectCalibration.ts
// CalibrationStrategy adapter: derives real-world scale from a known reference
// object (a length whose true size is known, e.g. a 0.2286 m basketball or a
// 0.067 m tennis ball measured in pixels on screen). Lives under adapters/**
// because it is an exchangeable strategy implementation behind the port; the
// math itself is pure but this is the swappable plug for the CalibrationStrategy
// contract. Future siblings: arDepthCalibration, knownHeightCalibration.

import type { CalibrationStrategy, CalibrationInput } from '@/ports';
import type { CalibrationData } from '@/domain';

export interface ReferenceObjectCalibrationOptions {
  /**
   * Identifier surfaced through the port so callers/telemetry can tell which
   * strategy produced a CalibrationData instance.
   */
  id?: string;
  /**
   * Baseline trust for a manually-sized reference object. A clean,
   * front-on measurement of a known object is reasonably reliable but not as
   * good as depth-sensor calibration, hence < 1.
   */
  baseConfidence?: number;
}

const DEFAULT_ID = 'reference-object';
const DEFAULT_BASE_CONFIDENCE = 0.7;

/**
 * Minimum number of pixels the reference object must span for the measurement
 * to be meaningful. Below this, a one-pixel error dominates the scale and the
 * result is effectively noise, so confidence is heavily penalised.
 */
const RELIABLE_REFERENCE_PIXELS = 40;

export class ReferenceObjectCalibration implements CalibrationStrategy {
  readonly id: string;
  readonly confidence: number;

  constructor(options: ReferenceObjectCalibrationOptions = {}) {
    this.id = options.id ?? DEFAULT_ID;
    this.confidence = clamp01(options.baseConfidence ?? DEFAULT_BASE_CONFIDENCE);
  }

  /**
   * Turn a pixel measurement of a known-size object into a metres-per-pixel
   * scale and full CalibrationData record.
   *
   * metersPerPixel = referenceRealMeters / referencePixelWidth
   */
  compute(input: CalibrationInput): CalibrationData {
    const { referencePixelWidth, referenceRealMeters, frameWidth, frameHeight } = input;

    if (!isFinite(referencePixelWidth) || referencePixelWidth <= 0) {
      throw new RangeError(
        `referencePixelWidth must be a positive number, got ${referencePixelWidth}`,
      );
    }
    if (!isFinite(referenceRealMeters) || referenceRealMeters <= 0) {
      throw new RangeError(
        `referenceRealMeters must be a positive number, got ${referenceRealMeters}`,
      );
    }
    if (!isFinite(frameWidth) || frameWidth <= 0) {
      throw new RangeError(`frameWidth must be a positive number, got ${frameWidth}`);
    }
    if (!isFinite(frameHeight) || frameHeight <= 0) {
      throw new RangeError(`frameHeight must be a positive number, got ${frameHeight}`);
    }

    const metersPerPixel = referenceRealMeters / referencePixelWidth;

    return {
      referencePixelWidth,
      referenceRealMeters,
      frameWidth,
      frameHeight,
      metersPerPixel,
    };
  }

  /**
   * Per-measurement confidence. Combines this strategy's base trust with a
   * penalty when the reference object is too small on screen (where pixel
   * quantisation error dominates). Returns 0..1.
   */
  confidenceFor(input: CalibrationInput): number {
    const px = input.referencePixelWidth;
    if (!isFinite(px) || px <= 0) return 0;
    const sizeFactor = clamp01(px / RELIABLE_REFERENCE_PIXELS);
    return clamp01(this.confidence * sizeFactor);
  }
}

function clamp01(n: number): number {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
