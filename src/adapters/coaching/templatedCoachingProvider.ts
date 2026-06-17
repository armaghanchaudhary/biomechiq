// src/adapters/coaching/templatedCoachingProvider.ts
// A CoachingProvider adapter that needs no LLM — formats domain feedback into
// plain language. Serves as the offline/rules-based fallback (and as a concrete
// second adapter proving the CoachingProvider port is swappable).

import type {
  CoachingProvider,
  CoachingContext,
  CoachingResponse,
  ChatMessage,
} from '@/ports';

export class TemplatedCoachingProvider implements CoachingProvider {
  async generateFeedback(ctx: CoachingContext): Promise<CoachingResponse> {
    const headline = `Form ${ctx.formScore}/100 · peak ${ctx.peakSpeedKmh} km/h`;
    const fixes = ctx.jointFeedback
      .filter((t) => t.severity === 'warn')
      .map((t) => t.message);
    const text =
      fixes.length > 0
        ? `${headline}. Focus on: ${fixes.join('; ')}.`
        : `${headline}. Solid rep — keep it up.`;
    return { text, tips: ctx.jointFeedback };
  }

  async chat(_history: ChatMessage[], ctx: CoachingContext): Promise<string> {
    return `In ${ctx.sport}, your form is ${ctx.formScore}/100. Ask me what to adjust.`;
  }
}
