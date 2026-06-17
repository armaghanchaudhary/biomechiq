// src/adapters/coaching/coachingWithFallback.ts
// A CoachingProvider decorator that adds resilience: it tries a primary provider
// (e.g. ClaudeCoachingProvider) first and transparently falls back to a secondary
// (e.g. TemplatedCoachingProvider) whenever the primary throws — network error,
// missing API key, rate limit, or malformed response. The app always gets a
// usable coaching answer, online or off.

import type {
  CoachingProvider,
  CoachingContext,
  CoachingResponse,
  ChatMessage,
} from '@/ports';

export interface CoachingWithFallbackOptions {
  /** Invoked when the primary fails and the fallback is used. For analytics/telemetry. */
  onFallback?: (error: unknown, stage: 'generateFeedback' | 'chat') => void;
}

export class CoachingWithFallback implements CoachingProvider {
  private readonly primary: CoachingProvider;
  private readonly fallback: CoachingProvider;
  private readonly onFallback?: CoachingWithFallbackOptions['onFallback'];

  constructor(
    primary: CoachingProvider,
    fallback: CoachingProvider,
    options: CoachingWithFallbackOptions = {},
  ) {
    this.primary = primary;
    this.fallback = fallback;
    this.onFallback = options.onFallback;
  }

  async generateFeedback(ctx: CoachingContext): Promise<CoachingResponse> {
    try {
      return await this.primary.generateFeedback(ctx);
    } catch (error) {
      this.onFallback?.(error, 'generateFeedback');
      return this.fallback.generateFeedback(ctx);
    }
  }

  async chat(history: ChatMessage[], ctx: CoachingContext): Promise<string> {
    try {
      return await this.primary.chat(history, ctx);
    } catch (error) {
      this.onFallback?.(error, 'chat');
      return this.fallback.chat(history, ctx);
    }
  }
}
