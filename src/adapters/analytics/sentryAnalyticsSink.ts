// src/adapters/analytics/sentryAnalyticsSink.ts
// AnalyticsSink adapter backed by @sentry/react-native. Sentry is an error/crash
// monitor first, so this sink specialises in error capture; events and identity
// are recorded as breadcrumbs / user context. Pair it with a real product-analytics
// sink (e.g. PostHog) via CompositeAnalyticsSink for full event tracking.

import * as Sentry from '@sentry/react-native';
import type { AnalyticsSink } from '@/ports';

/**
 * Minimal slice of the Sentry surface this adapter touches. Declaring it locally
 * keeps the adapter unit-testable (the test injects a fake) without depending on
 * Sentry's full typings.
 */
export interface SentryLike {
  captureException(error: unknown, hint?: { data?: Record<string, unknown> }): string;
  addBreadcrumb(breadcrumb: {
    category?: string;
    message?: string;
    level?: string;
    data?: Record<string, unknown>;
  }): void;
  setUser(user: { id: string; [key: string]: unknown } | null): void;
}

export class SentryAnalyticsSink implements AnalyticsSink {
  constructor(private readonly client: SentryLike = Sentry as unknown as SentryLike) {}

  track(event: string, props?: Record<string, unknown>): void {
    // Sentry has no first-class event analytics; record as a breadcrumb so the
    // event still shows up in the trail attached to any later error.
    this.client.addBreadcrumb({
      category: 'analytics',
      message: event,
      level: 'info',
      data: props,
    });
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    this.client.setUser({ id: userId, ...(traits ?? {}) });
  }

  captureError(error: unknown, context?: Record<string, unknown>): void {
    this.client.captureException(error, context ? { data: context } : undefined);
  }
}
