// src/adapters/analytics/compositeAnalyticsSink.ts
// Fan-out AnalyticsSink: forwards every call to a list of delegate sinks.
// Typical use: register a CompositeAnalyticsSink([sentrySink, posthogSink]) so
// errors flow to Sentry and events flow to PostHog from a single injected sink.
//
// One delegate throwing must not stop the others or the caller, so each call is
// isolated; failures are surfaced to an optional error handler instead of being
// swallowed silently.

import type { AnalyticsSink } from '@/ports';

export interface CompositeSinkOptions {
  /** Called when a delegate throws. Defaults to console.error. */
  onError?: (error: unknown, method: keyof AnalyticsSink) => void;
}

export class CompositeAnalyticsSink implements AnalyticsSink {
  private readonly sinks: AnalyticsSink[];
  private readonly onError: (error: unknown, method: keyof AnalyticsSink) => void;

  constructor(sinks: AnalyticsSink[], options: CompositeSinkOptions = {}) {
    this.sinks = sinks;
    this.onError =
      options.onError ??
      ((error, method) => console.error(`[analytics] ${method} delegate failed`, error));
  }

  private fanOut(method: keyof AnalyticsSink, call: (sink: AnalyticsSink) => void): void {
    for (const sink of this.sinks) {
      try {
        call(sink);
      } catch (error) {
        this.onError(error, method);
      }
    }
  }

  track(event: string, props?: Record<string, unknown>): void {
    this.fanOut('track', (s) => s.track(event, props));
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    this.fanOut('identify', (s) => s.identify(userId, traits));
  }

  captureError(error: unknown, context?: Record<string, unknown>): void {
    this.fanOut('captureError', (s) => s.captureError(error, context));
  }
}
