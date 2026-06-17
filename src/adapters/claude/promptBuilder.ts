// src/adapters/claude/promptBuilder.ts
// Turns a biomechanics CoachingContext into a tight, structured system + user
// prompt that yields specific, prioritized, sport-aware coaching — not generic
// tips. Pure string assembly; no vendor SDK, so it is independently testable.

import type {
  CoachingContext,
  ChatMessage,
} from '@/ports';
import type { CoachingTip } from '@/domain';

/**
 * System prompt: locks the model into the role of a biomechanics coach and
 * fixes the output shape so generateFeedback() can parse it deterministically.
 */
export const COACHING_SYSTEM_PROMPT = [
  'You are an elite sports biomechanics coach analyzing a single recorded rep.',
  'You receive objective, frame-derived measurements: an overall form score,',
  'object speed, and per-joint deviations from the sport-specific ideal angle range.',
  '',
  'Rules:',
  '- Give 2-4 prioritized, actionable fixes — most impactful first.',
  '- Each fix must reference a specific joint and the measured deviation, then a',
  '  concrete cue the athlete can feel (not vague advice like "improve form").',
  '- Be sport-aware: tie cues to the demands of the named sport.',
  '- If a joint is already in range, do not invent a problem for it.',
  '- Keep it concise — coaching, not an essay.',
  '',
  'Respond with STRICT JSON only, no prose outside the JSON, matching:',
  '{"summary": string, "fixes": [{"joint": string, "message": string, "priority": number}]}',
  'priority is 1 (most important) ascending. List at most 4 fixes.',
].join('\n');

function describeJointFeedback(tips: CoachingTip[]): string {
  if (tips.length === 0) return '(no per-joint deviations flagged)';
  return tips
    .map((t) => {
      const joint = t.joint ? t.joint : 'overall';
      return `- [${t.severity}] ${joint}: ${t.message}`;
    })
    .join('\n');
}

/** Builds the user-turn content describing this rep's measurements. */
export function buildCoachingUserPrompt(ctx: CoachingContext): string {
  return [
    `Sport: ${ctx.sport}`,
    `Form score: ${ctx.formScore}/100`,
    `Peak object speed: ${ctx.peakSpeedKmh} km/h`,
    `Average object speed: ${ctx.avgSpeedKmh} km/h`,
    '',
    'Per-joint analysis (deviation from ideal range):',
    describeJointFeedback(ctx.jointFeedback),
    '',
    'Give the prioritized fixes as specified.',
  ].join('\n');
}

/**
 * Builds the messages array for a follow-up chat turn. The current rep's
 * measurements are injected as a leading context block so the model answers
 * grounded in real numbers, then the prior conversation is replayed.
 */
export function buildChatMessages(
  history: ChatMessage[],
  ctx: CoachingContext,
): ChatMessage[] {
  const context: ChatMessage = {
    role: 'user',
    content: [
      'Context for this coaching conversation (do not restate verbatim):',
      buildCoachingUserPrompt(ctx),
    ].join('\n'),
  };
  // Collapse a leading assistant turn — the API requires the first turn to be
  // a user message, and the injected context already is one.
  return [context, ...history];
}
