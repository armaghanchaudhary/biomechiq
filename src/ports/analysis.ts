// src/ports/analysis.ts
// Ports for analysis: speed estimation, calibration, AI coaching.

import { CalibrationData, TrackedObject, CoachingTip, Sport } from '@/domain';

/**
 * Computes object velocity from tracked positions. The domain SpeedEngine
 * structurally satisfies this port; future adapters: AR/LiDAR depth, radar fusion.
 */
export interface SpeedEstimator {
  update(obj: TrackedObject, timestampMs: number, frameWidth: number, frameHeight: number): number;
  objectLost(): void;
  getPeakSpeed(): number;
  resetSession(): void;
  setCalibration(data: CalibrationData): void;
}

export interface CalibrationInput {
  referencePixelWidth: number;
  referenceRealMeters: number;
  frameWidth: number;
  frameHeight: number;
}

/** Strategy for turning pixels into real-world scale. Adapters: reference-object, AR-depth. */
export interface CalibrationStrategy {
  readonly id: string;
  readonly confidence: number; // 0-1 quality/trustworthiness of this calibration
  compute(input: CalibrationInput): CalibrationData;
}

export interface CoachingContext {
  sport: Sport;
  formScore: number;
  peakSpeedKmh: number;
  avgSpeedKmh: number;
  jointFeedback: CoachingTip[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CoachingResponse {
  text: string;
  tips: CoachingTip[];
}

/** Natural-language coaching. Adapter: Claude; fallbacks: other LLM, templated rules engine. */
export interface CoachingProvider {
  generateFeedback(ctx: CoachingContext): Promise<CoachingResponse>;
  chat(history: ChatMessage[], ctx: CoachingContext): Promise<string>;
}
