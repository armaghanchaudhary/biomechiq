// src/application/generateCoaching.ts
// Use case: GenerateCoaching. Builds a coaching context and delegates to the
// CoachingProvider port (Claude adapter, etc.).

import { Sport, CoachingTip } from '@/domain';
import type {
  CoachingProvider,
  CoachingContext,
  CoachingResponse,
  ChatMessage,
} from '@/ports';

export interface SessionMetricsSnapshot {
  sport: Sport;
  formScore: number;
  peakSpeedKmh: number;
  avgSpeedKmh: number;
  tips: CoachingTip[];
}

export function buildCoachingContext(m: SessionMetricsSnapshot): CoachingContext {
  return {
    sport: m.sport,
    formScore: m.formScore,
    peakSpeedKmh: m.peakSpeedKmh,
    avgSpeedKmh: m.avgSpeedKmh,
    jointFeedback: m.tips,
  };
}

export function makeGenerateCoaching(coach: CoachingProvider) {
  return {
    feedback: (m: SessionMetricsSnapshot): Promise<CoachingResponse> =>
      coach.generateFeedback(buildCoachingContext(m)),
    chat: (history: ChatMessage[], m: SessionMetricsSnapshot): Promise<string> =>
      coach.chat(history, buildCoachingContext(m)),
  };
}
