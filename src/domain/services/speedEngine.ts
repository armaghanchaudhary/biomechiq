// src/domain/services/speedEngine.ts
// Speed computation + throw detection from tracked object positions across frames.
// PURE domain service. Structurally satisfies the SpeedEstimator port (see src/ports).

import { CalibrationData, SpeedSample, TrackedObject } from '../types';

const DEFAULT_SCENE_WIDTH_METERS = 2.0;
const MAX_SPEED_KMH = 350; // physical ceiling (fastest recorded ball: 263 km/h cricket)
const SMOOTHING_WINDOW = 5;
const MIN_PIXEL_MOVEMENT = 3; // ignore jitter below this threshold

interface FrameRecord {
  obj: TrackedObject;
  timestamp: number;
  frameWidth: number;
  frameHeight: number;
}

export class SpeedEngine {
  private history: FrameRecord[] = [];
  private speedBuffer: number[] = [];
  private peakSpeed = 0;
  private calibration: CalibrationData | null = null;

  // ── Calibration ─────────────────────────────────────

  setCalibration(data: CalibrationData): void {
    this.calibration = data;
  }

  defaultCalibration(frameWidth: number, frameHeight: number): CalibrationData {
    return {
      referencePixelWidth: frameWidth,
      referenceRealMeters: DEFAULT_SCENE_WIDTH_METERS,
      frameWidth,
      frameHeight,
      metersPerPixel: DEFAULT_SCENE_WIDTH_METERS / frameWidth,
    };
  }

  // ── Core speed computation ───────────────────────────

  /**
   * Feed a new detected object position and get back current speed.
   * Call this every frame the object is detected.
   */
  update(obj: TrackedObject, timestamp: number, frameWidth: number, frameHeight: number): number {
    const record: FrameRecord = { obj, timestamp, frameWidth, frameHeight };

    if (this.history.length === 0) {
      this.history.push(record);
      return 0;
    }

    const prev = this.history[this.history.length - 1];
    const rawSpeed = this.computeSpeedBetweenFrames(prev, record);
    const smoothed = this.smooth(rawSpeed);

    this.history.push(record);
    // Keep only last 10 frames
    if (this.history.length > 10) this.history.shift();

    if (smoothed > this.peakSpeed) {
      this.peakSpeed = smoothed;
    }

    return smoothed;
  }

  /**
   * Call when object is lost — resets positional state but keeps stats
   */
  objectLost(): void {
    this.history = [];
    this.smooth(0); // push zero into buffer
  }

  getPeakSpeed(): number {
    return this.peakSpeed;
  }

  resetSession(): void {
    this.history = [];
    this.speedBuffer = [];
    this.peakSpeed = 0;
  }

  // ── Private helpers ─────────────────────────────────

  private computeSpeedBetweenFrames(prev: FrameRecord, curr: FrameRecord): number {
    const dt = (curr.timestamp - prev.timestamp) / 1000; // seconds
    if (dt <= 0 || dt > 0.5) return 0; // bad delta — skip

    // Convert normalized coords to pixels
    const prevPxX = prev.obj.x * prev.frameWidth;
    const prevPxY = prev.obj.y * prev.frameHeight;
    const currPxX = curr.obj.x * curr.frameWidth;
    const currPxY = curr.obj.y * curr.frameHeight;

    const pixelDist = Math.sqrt(
      Math.pow(currPxX - prevPxX, 2) +
      Math.pow(currPxY - prevPxY, 2)
    );

    // Ignore noise
    if (pixelDist < MIN_PIXEL_MOVEMENT) return 0;

    // Get calibration
    const cal = this.calibration ?? this.defaultCalibration(curr.frameWidth, curr.frameHeight);

    // Real-world distance
    const meters = pixelDist * cal.metersPerPixel;
    const mps = meters / dt;
    const kmh = mps * 3.6;

    return Math.min(MAX_SPEED_KMH, Math.round(kmh));
  }

  private smooth(raw: number): number {
    this.speedBuffer.push(raw);
    if (this.speedBuffer.length > SMOOTHING_WINDOW) {
      this.speedBuffer.shift();
    }
    const sum = this.speedBuffer.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.speedBuffer.length);
  }
}

// ── Throw / release detection ─────────────────────────

const THROW_SPEED_THRESHOLD = 15; // km/h to count as a throw
const THROW_COOLDOWN_FRAMES = 30;

export class ThrowDetector {
  private inThrow = false;
  private cooldown = 0;
  private count = 0;

  update(speedKmh: number): { isThrow: boolean; throwCount: number } {
    if (this.cooldown > 0) this.cooldown--;

    const isThrow =
      speedKmh > THROW_SPEED_THRESHOLD &&
      !this.inThrow &&
      this.cooldown === 0;

    if (isThrow) {
      this.inThrow = true;
      this.count++;
      this.cooldown = THROW_COOLDOWN_FRAMES;
    }

    if (speedKmh < 5) {
      this.inThrow = false;
    }

    return { isThrow, throwCount: this.count };
  }

  reset(): void {
    this.inThrow = false;
    this.cooldown = 0;
    this.count = 0;
  }
}
