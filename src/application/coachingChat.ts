// src/application/coachingChat.ts
// Use case: ConversationalCoaching. Threads the current biomechanics context into
// a multi-turn coaching conversation, delegating to the CoachingProvider port.
// Pure application logic — depends only on @/ports + @/domain — so it works with
// any provider (Claude, templated fallback, future LLMs) without modification.

import { Sport, CoachingTip } from '@/domain';
import type {
  CoachingProvider,
  CoachingContext,
  ChatMessage,
} from '@/ports';

export interface CoachingChatContext {
  sport: Sport;
  formScore: number;
  peakSpeedKmh: number;
  avgSpeedKmh: number;
  tips: CoachingTip[];
}

function toCoachingContext(c: CoachingChatContext): CoachingContext {
  return {
    sport: c.sport,
    formScore: c.formScore,
    peakSpeedKmh: c.peakSpeedKmh,
    avgSpeedKmh: c.avgSpeedKmh,
    jointFeedback: c.tips,
  };
}

/** Appends the athlete's latest message onto the running history. */
export function appendUserTurn(
  history: ChatMessage[],
  message: string,
): ChatMessage[] {
  return [...history, { role: 'user', content: message }];
}

export interface CoachingChat {
  /** Replays the full conversation history with the current context for the next reply. */
  ask(history: ChatMessage[], context: CoachingChatContext): Promise<string>;
  /** Convenience: appends `message` to `history`, asks, and returns the updated transcript. */
  send(
    history: ChatMessage[],
    message: string,
    context: CoachingChatContext,
  ): Promise<{ reply: string; history: ChatMessage[] }>;
}

export function makeCoachingChat(coach: CoachingProvider): CoachingChat {
  const ask = (
    history: ChatMessage[],
    context: CoachingChatContext,
  ): Promise<string> => coach.chat(history, toCoachingContext(context));

  return {
    ask,
    async send(history, message, context) {
      const next = appendUserTurn(history, message);
      const reply = await ask(next, context);
      return {
        reply,
        history: [...next, { role: 'assistant', content: reply }],
      };
    },
  };
}
