// src/adapters/claude/claudeCoachingProvider.ts
// CoachingProvider adapter backed by the Anthropic Messages API. Vendor calls
// are made via fetch (no SDK dependency), keeping the install footprint small
// and the adapter usable in React Native / Expo where the Node SDK is awkward.

import type {
  CoachingProvider,
  CoachingContext,
  CoachingResponse,
  ChatMessage,
} from '@/ports';
import type { CoachingTip, FeedbackSeverity } from '@/domain';
import {
  COACHING_SYSTEM_PROMPT,
  buildCoachingUserPrompt,
  buildChatMessages,
} from './promptBuilder';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Current cost-balanced default; configurable to a stronger model per options. */
export const DEFAULT_COACHING_MODEL = 'claude-sonnet-4-6';

export interface ClaudeCoachingProviderOptions {
  /** Overrides process.env.EXPO_PUBLIC_CLAUDE_API_KEY. */
  apiKey?: string;
  /** Model id, e.g. 'claude-opus-4-8' for higher quality. */
  model?: string;
  /** Max output tokens per request. */
  maxTokens?: number;
  /** Injectable for testing; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

interface AnthropicMessagesResponse {
  content?: AnthropicTextBlock[];
  stop_reason?: string;
}

interface ParsedFix {
  joint?: string;
  message?: string;
  priority?: number;
}

export class ClaudeCoachingProvider implements CoachingProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClaudeCoachingProviderOptions = {}) {
    this.apiKey =
      options.apiKey ?? process.env.EXPO_PUBLIC_CLAUDE_API_KEY ?? '';
    this.model = options.model ?? DEFAULT_COACHING_MODEL;
    this.maxTokens = options.maxTokens ?? 1024;
    const resolvedFetch = options.fetchImpl ?? globalThis.fetch;
    if (!resolvedFetch) {
      throw new Error(
        'ClaudeCoachingProvider: no fetch implementation available',
      );
    }
    this.fetchImpl = resolvedFetch;
  }

  async generateFeedback(ctx: CoachingContext): Promise<CoachingResponse> {
    const responseText = await this.callMessages(
      COACHING_SYSTEM_PROMPT,
      [{ role: 'user', content: buildCoachingUserPrompt(ctx) }],
    );
    return this.parseFeedback(responseText, ctx);
  }

  async chat(history: ChatMessage[], ctx: CoachingContext): Promise<string> {
    const messages = buildChatMessages(history, ctx);
    return this.callMessages(
      COACHING_SYSTEM_PROMPT,
      messages,
    );
  }

  /** Issues one Messages API request and returns the concatenated text blocks. */
  private async callMessages(
    system: string,
    messages: ChatMessage[],
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        'ClaudeCoachingProvider: missing API key (EXPO_PUBLIC_CLAUDE_API_KEY)',
      );
    }

    const res = await this.fetchImpl(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        messages,
      }),
    });

    if (!res.ok) {
      const detail = await safeReadText(res);
      throw new Error(
        `ClaudeCoachingProvider: Anthropic API ${res.status} ${res.statusText} ${detail}`.trim(),
      );
    }

    const data = (await res.json()) as AnthropicMessagesResponse;
    return extractText(data);
  }

  /** Parses the strict-JSON coaching reply; falls back to domain tips on drift. */
  private parseFeedback(
    raw: string,
    ctx: CoachingContext,
  ): CoachingResponse {
    const parsed = tryParseJson(raw);
    if (!parsed) {
      // Model returned prose instead of JSON — surface it, keep domain tips.
      return { text: raw.trim(), tips: ctx.jointFeedback };
    }

    const summary =
      typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const fixes: ParsedFix[] = Array.isArray(parsed.fixes) ? parsed.fixes : [];

    const tips: CoachingTip[] = fixes
      .filter((f) => typeof f.message === 'string' && f.message.length > 0)
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
      .map((f) => ({
        severity: 'warn' as FeedbackSeverity,
        message: f.message as string,
        joint: typeof f.joint === 'string' ? f.joint : undefined,
      }));

    const text =
      summary.length > 0
        ? summary
        : tips.map((t) => t.message).join(' ') || raw.trim();

    return { text, tips: tips.length > 0 ? tips : ctx.jointFeedback };
  }
}

function extractText(data: AnthropicMessagesResponse): string {
  if (!data.content) return '';
  return data.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('')
    .trim();
}

interface ParsedFeedbackJson {
  summary?: unknown;
  fixes?: unknown;
}

function tryParseJson(raw: string): ParsedFeedbackJson | null {
  // Tolerate stray prose or code fences around the JSON object.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = raw.slice(start, end + 1);
  try {
    return JSON.parse(slice) as ParsedFeedbackJson;
  } catch {
    return null;
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
