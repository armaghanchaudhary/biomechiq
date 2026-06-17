// test/claudeCoachingProvider.test.ts
// Verifies the Claude adapter's request shape and response parsing with a
// fully mocked fetch — no real network calls are made.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ClaudeCoachingProvider,
  DEFAULT_COACHING_MODEL,
} from '@/adapters/claude/claudeCoachingProvider';
import {
  COACHING_SYSTEM_PROMPT,
  buildChatMessages,
} from '@/adapters/claude/promptBuilder';
import type { CoachingContext, ChatMessage } from '@/ports';

const ctx: CoachingContext = {
  sport: 'tennis',
  formScore: 72,
  peakSpeedKmh: 118,
  avgSpeedKmh: 95,
  jointFeedback: [
    { severity: 'warn', message: 'Elbow over-extended by 14°', joint: 'right_elbow' },
    { severity: 'good', message: 'Knee within range', joint: 'left_knee' },
  ],
};

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('ClaudeCoachingProvider.generateFeedback', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a correctly shaped Anthropic Messages request', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Tighten the elbow.',
              fixes: [
                { joint: 'right_elbow', message: 'Keep elbow softer at contact', priority: 1 },
              ],
            }),
          },
        ],
      }),
    );

    const provider = new ClaudeCoachingProvider({
      apiKey: 'test-key-123',
      model: 'claude-opus-4-8',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await provider.generateFeedback(ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');

    // Headers exactly per the documented Messages API.
    expect(init.headers['x-api-key']).toBe('test-key-123');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(init.headers['content-type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body.model).toBe('claude-opus-4-8');
    expect(typeof body.max_tokens).toBe('number');
    expect(body.system).toBe(COACHING_SYSTEM_PROMPT);
    expect(body.messages[0].role).toBe('user');

    // Prompt carries the sport and the joint delta so coaching is grounded.
    const userPrompt: string = body.messages[0].content;
    expect(userPrompt).toContain('tennis');
    expect(userPrompt).toContain('right_elbow');
    expect(userPrompt).toContain('Elbow over-extended by 14°');
  });

  it('uses the cost-balanced default model when none is given', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({ content: [{ type: 'text', text: '{"summary":"ok","fixes":[]}' }] }),
    );
    const provider = new ClaudeCoachingProvider({
      apiKey: 'k',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await provider.generateFeedback(ctx);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe(DEFAULT_COACHING_MODEL);
  });

  it('parses the JSON reply into a CoachingResponse', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Two things to fix.',
              fixes: [
                { joint: 'shoulder', message: 'Rotate shoulder earlier', priority: 2 },
                { joint: 'right_elbow', message: 'Soften elbow at contact', priority: 1 },
              ],
            }),
          },
        ],
      }),
    );

    const provider = new ClaudeCoachingProvider({
      apiKey: 'k',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const res = await provider.generateFeedback(ctx);
    expect(res.text).toBe('Two things to fix.');
    expect(res.tips).toHaveLength(2);
    // Sorted by priority ascending — elbow (1) before shoulder (2).
    expect(res.tips[0].joint).toBe('right_elbow');
    expect(res.tips[0].severity).toBe('warn');
    expect(res.tips[1].joint).toBe('shoulder');
  });

  it('falls back to prose + domain tips when reply is not JSON', async () => {
    fetchMock.mockResolvedValue(
      mockJsonResponse({ content: [{ type: 'text', text: 'Nice swing overall.' }] }),
    );
    const provider = new ClaudeCoachingProvider({
      apiKey: 'k',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const res = await provider.generateFeedback(ctx);
    expect(res.text).toBe('Nice swing overall.');
    expect(res.tips).toEqual(ctx.jointFeedback);
  });

  it('throws on a non-OK API response', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ error: 'bad' }, false, 401));
    const provider = new ClaudeCoachingProvider({
      apiKey: 'k',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(provider.generateFeedback(ctx)).rejects.toThrow(/401/);
  });

  it('throws when no API key is configured', async () => {
    const provider = new ClaudeCoachingProvider({
      apiKey: '',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(provider.generateFeedback(ctx)).rejects.toThrow(/API key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ClaudeCoachingProvider.chat', () => {
  it('replays history after an injected context turn and returns text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({ content: [{ type: 'text', text: 'Bend your knees more.' }] }),
    );
    const provider = new ClaudeCoachingProvider({
      apiKey: 'k',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const history: ChatMessage[] = [
      { role: 'user', content: 'How do I add power?' },
    ];
    const reply = await provider.chat(history, ctx);
    expect(reply).toBe('Bend your knees more.');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // First turn is the injected context (user role), history follows.
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toContain('tennis');
    expect(body.messages[body.messages.length - 1].content).toBe('How do I add power?');
  });
});

describe('buildChatMessages', () => {
  it('prepends a user context turn carrying the sport', () => {
    const msgs = buildChatMessages([{ role: 'user', content: 'hi' }], ctx);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toContain('tennis');
    expect(msgs[1].content).toBe('hi');
  });
});
