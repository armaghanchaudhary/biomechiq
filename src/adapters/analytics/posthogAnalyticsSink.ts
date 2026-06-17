// src/adapters/analytics/posthogAnalyticsSink.ts
// AnalyticsSink adapter for PostHog product analytics.
//
// NOTE: 'posthog-react-native' is NOT installed. Until the integrator adds it,
// this is a console/no-op stand-in that satisfies the port so the app can run and
// be wired end-to-end. Swap the `client` for a real PostHog instance once the
// dependency is installed — the public surface here mirrors the PostHog SDK
// (capture / identify) so the call sites won't change.

import type { AnalyticsSink } from '@/ports';

/** The subset of the PostHog SDK this sink uses. */
export interface PostHogLike {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(distinctId: string, properties?: Record<string, unknown>): void;
}

export interface PostHogSinkOptions {
  /** When no real client is supplied, log to console instead of silently dropping. */
  debug?: boolean;
  /** Injected logger, defaults to the global console. Eases testing. */
  logger?: Pick<Console, 'log' | 'error'>;
}

export class PostHogAnalyticsSink implements AnalyticsSink {
  private readonly client?: PostHogLike;
  private readonly debug: boolean;
  private readonly logger: Pick<Console, 'log' | 'error'>;

  constructor(client?: PostHogLike, options: PostHogSinkOptions = {}) {
    this.client = client;
    this.debug = options.debug ?? client === undefined;
    this.logger = options.logger ?? console;
  }

  track(event: string, props?: Record<string, unknown>): void {
    if (this.client) {
      this.client.capture(event, props);
      return;
    }
    if (this.debug) this.logger.log(`[posthog:noop] track ${event}`, props ?? {});
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    if (this.client) {
      this.client.identify(userId, traits);
      return;
    }
    if (this.debug) this.logger.log(`[posthog:noop] identify ${userId}`, traits ?? {});
  }

  captureError(error: unknown, context?: Record<string, unknown>): void {
    // PostHog isn't an error monitor; surface as a normal event so it still
    // lands in the funnel. Real crash capture belongs to the Sentry sink.
    if (this.client) {
      this.client.capture('$exception', {
        message: error instanceof Error ? error.message : String(error),
        ...context,
      });
      return;
    }
    if (this.debug) this.logger.error('[posthog:noop] captureError', error, context ?? {});
  }
}
