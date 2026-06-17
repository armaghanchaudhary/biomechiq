// src/application/analyzeFrame.ts
// Use cases: AnalyzeLiveFrame + ComputeSpeed. Orchestrate the domain + the
// SpeedEstimator port. No vendor SDKs — the adapter behind the port does the work.

import { Landmark, TrackedObject, Sport, CoachingTip } from '@/domain';
import type { SpeedEstimator } from '@/ports';
import { scoreForm } from './scoreForm';

export interface FrameInput {
  sport: Sport;
  landmarks: Landmark[] | null;
  object: TrackedObject | null;
  frameWidth: number;
  frameHeight: number;
  timestampMs: number;
}

export interface FrameMetrics {
  speedKmh: number;
  peakSpeedKmh: number;
  formScore: number;
  tips: CoachingTip[];
  poseDetected: boolean;
  objectDetected: boolean;
}

/** Per-frame analysis: updates speed from the object and scores the pose. */
export function makeAnalyzeFrame(speed: SpeedEstimator) {
  return (input: FrameInput): FrameMetrics => {
    let speedKmh = 0;
    if (input.object) {
      speedKmh = speed.update(
        input.object,
        input.timestampMs,
        input.frameWidth,
        input.frameHeight
      );
    } else {
      speed.objectLost();
    }

    const form = input.landmarks
      ? scoreForm(input.sport, input.landmarks)
      : { formScore: 0, tips: [] as CoachingTip[] };

    return {
      speedKmh,
      peakSpeedKmh: speed.getPeakSpeed(),
      formScore: form.formScore,
      tips: form.tips,
      poseDetected: input.landmarks !== null,
      objectDetected: input.object !== null,
    };
  };
}

/** Standalone speed update (when only object tracking is needed). */
export function makeComputeSpeed(speed: SpeedEstimator) {
  return (
    object: TrackedObject,
    timestampMs: number,
    frameWidth: number,
    frameHeight: number
  ): number => speed.update(object, timestampMs, frameWidth, frameHeight);
}
