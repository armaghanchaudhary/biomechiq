// test/coachingRobustness.test.ts
// Workstream H: coaching fallback decorator + conversational chat use case.

import { describe, it, expect, vi } from 'vitest';
import { CoachingWithFallback } from '@/adapters/coaching/coachingWithFallback';
import { makeCoachingChat, appendUserTurn } from '@/application/coachingChat';
import { TemplatedCoachingProvider } from '@/adapters/coaching/templatedCoachingProvider';
import type {
  CoachingProvider,
  CoachingContext,
  CoachingResponse,
  ChatMessage,
} from '@/ports';

const ctx: CoachingContext = {
  sport: 'tennis',
  formScore: 82,
  peakSpeedKmh: 140,
  avgSpeedKmh: 110,
  jointFeedback: [{ severity: 'warn', message: 'Bend the knees more', joint: 'knee' }],
};

const chatCtx = {
  sport: 'tennis' as const,
  formScore: 82,
  peakSpeedKmh: 140,
  avgSpeedKmh: 110,
  tips: ctx.jointFeedback,
};

function okProvider(): CoachingProvider {
  return {
    generateFeedback: vi.fn(
      async (): Promise<CoachingResponse> => ({ text: 'primary feedback', tips: [] }),
    ),
    chat: vi.fn(async (): Promise<string> => 'primary chat'),
  };
}

function throwingProvider(err = new Error('boom')): CoachingProvider {
  return {
    generateFeedback: vi.fn(async (): Promise<CoachingResponse> => {
      throw err;
    }),
    chat: vi.fn(async (): Promise<string> => {
      throw err;
    }),
  };
}

describe('CoachingWithFallback', () => {
  it('uses the primary provider when it succeeds', async () => {
    const fallback = throwingProvider(); // would throw if reached
    const provider = new CoachingWithFallback(okProvider(), fallback);

    const fb = await provider.generateFeedback(ctx);
    expect(fb.text).toBe('primary feedback');
    expect(await provider.chat([], ctx)).toBe('primary chat');
    expect(fallback.generateFeedback).not.toHaveBeenCalled();
    expect(fallback.chat).not.toHaveBeenCalled();
  });

  it('falls back when the primary generateFeedback throws', async () => {
    const onFallback = vi.fn();
    const provider = new CoachingWithFallback(
      throwingProvider(),
      new TemplatedCoachingProvider(),
      { onFallback },
    );

    const fb = await provider.generateFeedback(ctx);
    expect(fb.text).toContain('Form 82/100');
    expect(fb.tips).toEqual(ctx.jointFeedback);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback.mock.calls[0][1]).toBe('generateFeedback');
  });

  it('falls back when the primary chat throws (e.g. missing API key)', async () => {
    const onFallback = vi.fn();
    const provider = new CoachingWithFallback(
      throwingProvider(new Error('missing API key')),
      new TemplatedCoachingProvider(),
      { onFallback },
    );

    const reply = await provider.chat([], ctx);
    expect(reply).toContain('tennis');
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback.mock.calls[0][1]).toBe('chat');
  });

  it('propagates fallback errors when both providers fail', async () => {
    const provider = new CoachingWithFallback(
      throwingProvider(new Error('primary down')),
      throwingProvider(new Error('fallback down')),
    );
    await expect(provider.chat([], ctx)).rejects.toThrow('fallback down');
  });
});

describe('makeCoachingChat', () => {
  it('replays the full history to the provider in order', async () => {
    const coach = okProvider();
    const chat = makeCoachingChat(coach);

    const history: ChatMessage[] = [
      { role: 'user', content: 'How do I serve faster?' },
      { role: 'assistant', content: 'Drive from the legs.' },
      { role: 'user', content: 'And my elbow?' },
    ];

    const reply = await chat.ask(history, chatCtx);
    expect(reply).toBe('primary chat');

    expect(coach.chat).toHaveBeenCalledTimes(1);
    const [passedHistory, passedCtx] = (coach.chat as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(passedHistory).toEqual(history); // full transcript replayed, order preserved
    expect(passedCtx).toEqual({
      sport: 'tennis',
      formScore: 82,
      peakSpeedKmh: 140,
      avgSpeedKmh: 110,
      jointFeedback: chatCtx.tips,
    });
  });

  it('send() appends the user turn and the assistant reply to the transcript', async () => {
    const coach = okProvider();
    const chat = makeCoachingChat(coach);
    const history: ChatMessage[] = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }];

    const { reply, history: next } = await chat.send(history, 'why is my form low?', chatCtx);

    expect(reply).toBe('primary chat');
    expect(next).toEqual([
      ...history,
      { role: 'user', content: 'why is my form low?' },
      { role: 'assistant', content: 'primary chat' },
    ]);

    // the provider saw the appended user turn, not just the original history
    const [passedHistory] = (coach.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(passedHistory[passedHistory.length - 1]).toEqual({
      role: 'user',
      content: 'why is my form low?',
    });
  });

  it('threads biomechanics context through the fallback provider end-to-end', async () => {
    const provider = new CoachingWithFallback(
      throwingProvider(),
      new TemplatedCoachingProvider(),
    );
    const chat = makeCoachingChat(provider);
    const reply = await chat.ask([{ role: 'user', content: 'tips?' }], chatCtx);
    expect(reply).toContain('82/100');
  });

  it('appendUserTurn is immutable', () => {
    const history: ChatMessage[] = [{ role: 'assistant', content: 'welcome' }];
    const next = appendUserTurn(history, 'thanks');
    expect(history).toHaveLength(1);
    expect(next).toEqual([
      { role: 'assistant', content: 'welcome' },
      { role: 'user', content: 'thanks' },
    ]);
  });
});
