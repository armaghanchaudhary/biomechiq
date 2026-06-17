// src/ports/platform.ts
// Ports for cross-cutting platform services: billing, analytics, notifications, charts, live state.

export type Entitlement = 'free' | 'pro' | 'coach';

/** Subscriptions/paywall. Adapter: RevenueCat; fallbacks: StoreKit/Play Billing, Stripe (web). */
export interface BillingProvider {
  getEntitlement(): Promise<Entitlement>;
  purchase(productId: string): Promise<boolean>;
  restore(): Promise<void>;
}

/** Events + error capture. Adapter: PostHog + Sentry. */
export interface AnalyticsSink {
  track(event: string, props?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  captureError(error: unknown, context?: Record<string, unknown>): void;
}

/** Push + local notifications. Adapter: Expo Notifications; fallbacks: OneSignal, FCM/APNs. */
export interface NotificationProvider {
  requestPermission(): Promise<boolean>;
  notify(title: string, body: string): Promise<void>;
  registerForPush(): Promise<string | null>;
}

export interface SeriesPoint {
  x: number;
  y: number;
}

/** Marker for the chart implementation; concrete renderers are platform components. */
export interface ChartRenderer {
  readonly kind: 'victory' | 'recharts' | 'd3';
}

/** Worklet-safe live state store abstraction. The Zustand store satisfies this shape. */
export interface LiveStateStore<T = unknown> {
  getState(): T;
  setState(partial: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: (s: T) => void): () => void;
}
