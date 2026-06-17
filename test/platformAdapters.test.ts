// test/platformAdapters.test.ts
// Unit tests for Workstream F platform adapters. Vendor native modules are mocked
// so the suite runs under vitest with no React Native / Expo runtime.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/react-native', () => ({
  captureException: vi.fn(() => 'event-id'),
  addBreadcrumb: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock('react-native-purchases', () => ({
  default: {
    getCustomerInfo: vi.fn(),
    getOfferings: vi.fn(),
    purchasePackage: vi.fn(),
    restorePurchases: vi.fn(),
  },
}));

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
}));

import { SentryAnalyticsSink } from '@/adapters/analytics/sentryAnalyticsSink';
import { PostHogAnalyticsSink } from '@/adapters/analytics/posthogAnalyticsSink';
import { CompositeAnalyticsSink } from '@/adapters/analytics/compositeAnalyticsSink';
import { ExpoNotificationProvider } from '@/adapters/notifications/expoNotificationProvider';
import { RevenueCatBillingProvider } from '@/adapters/billing/revenueCatBillingProvider';
import type { AnalyticsSink } from '@/ports';

describe('SentryAnalyticsSink', () => {
  const client = {
    captureException: vi.fn(() => 'id'),
    addBreadcrumb: vi.fn(),
    setUser: vi.fn(),
  };
  beforeEach(() => vi.clearAllMocks());

  it('captureError forwards to Sentry.captureException with context as hint data', () => {
    const sink = new SentryAnalyticsSink(client);
    const err = new Error('boom');
    sink.captureError(err, { sessionId: 's1' });
    expect(client.captureException).toHaveBeenCalledWith(err, { data: { sessionId: 's1' } });
  });

  it('captureError without context passes no hint', () => {
    const sink = new SentryAnalyticsSink(client);
    const err = new Error('boom');
    sink.captureError(err);
    expect(client.captureException).toHaveBeenCalledWith(err, undefined);
  });

  it('track records an analytics breadcrumb', () => {
    const sink = new SentryAnalyticsSink(client);
    sink.track('rep_recorded', { sport: 'tennis' });
    expect(client.addBreadcrumb).toHaveBeenCalledWith({
      category: 'analytics',
      message: 'rep_recorded',
      level: 'info',
      data: { sport: 'tennis' },
    });
  });

  it('identify sets the Sentry user with id and traits', () => {
    const sink = new SentryAnalyticsSink(client);
    sink.identify('u1', { plan: 'pro' });
    expect(client.setUser).toHaveBeenCalledWith({ id: 'u1', plan: 'pro' });
  });
});

describe('PostHogAnalyticsSink', () => {
  it('forwards track/identify to a real client when present', () => {
    const client = { capture: vi.fn(), identify: vi.fn() };
    const sink = new PostHogAnalyticsSink(client);
    sink.track('evt', { a: 1 });
    sink.identify('u1', { plan: 'free' });
    expect(client.capture).toHaveBeenCalledWith('evt', { a: 1 });
    expect(client.identify).toHaveBeenCalledWith('u1', { plan: 'free' });
  });

  it('maps captureError to a $exception event', () => {
    const client = { capture: vi.fn(), identify: vi.fn() };
    const sink = new PostHogAnalyticsSink(client);
    sink.captureError(new Error('nope'), { where: 'speed' });
    expect(client.capture).toHaveBeenCalledWith('$exception', {
      message: 'nope',
      where: 'speed',
    });
  });

  it('no-ops to console when no client is configured', () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const sink = new PostHogAnalyticsSink(undefined, { logger });
    sink.track('evt');
    sink.captureError(new Error('x'));
    expect(logger.log).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('CompositeAnalyticsSink', () => {
  it('fans every call out to all delegate sinks', () => {
    const a: AnalyticsSink = { track: vi.fn(), identify: vi.fn(), captureError: vi.fn() };
    const b: AnalyticsSink = { track: vi.fn(), identify: vi.fn(), captureError: vi.fn() };
    const composite = new CompositeAnalyticsSink([a, b]);
    composite.track('evt', { x: 1 });
    composite.identify('u1');
    const err = new Error('e');
    composite.captureError(err);
    expect(a.track).toHaveBeenCalledWith('evt', { x: 1 });
    expect(b.track).toHaveBeenCalledWith('evt', { x: 1 });
    expect(a.identify).toHaveBeenCalledWith('u1', undefined);
    expect(b.captureError).toHaveBeenCalledWith(err, undefined);
  });

  it('isolates a throwing delegate and reports it without stopping others', () => {
    const onError = vi.fn();
    const bad: AnalyticsSink = {
      track: vi.fn(() => {
        throw new Error('delegate down');
      }),
      identify: vi.fn(),
      captureError: vi.fn(),
    };
    const good: AnalyticsSink = { track: vi.fn(), identify: vi.fn(), captureError: vi.fn() };
    const composite = new CompositeAnalyticsSink([bad, good], { onError });
    expect(() => composite.track('evt')).not.toThrow();
    expect(good.track).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'track');
  });
});

describe('ExpoNotificationProvider', () => {
  function makeApi(over: Partial<Record<string, unknown>> = {}) {
    return {
      getPermissionsAsync: vi.fn(async () => ({ status: 'undetermined', granted: false })),
      requestPermissionsAsync: vi.fn(async () => ({ status: 'granted', granted: true })),
      scheduleNotificationAsync: vi.fn(async () => 'notif-id'),
      getExpoPushTokenAsync: vi.fn(async () => ({ data: 'ExponentPushToken[abc]' })),
      ...over,
    } as never;
  }

  it('returns true immediately when permission already granted', async () => {
    const api = makeApi({
      getPermissionsAsync: vi.fn(async () => ({ status: 'granted', granted: true })),
      requestPermissionsAsync: vi.fn(),
    });
    const provider = new ExpoNotificationProvider(api);
    expect(await provider.requestPermission()).toBe(true);
    expect((api as never as { requestPermissionsAsync: ReturnType<typeof vi.fn> }).requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission when not yet granted', async () => {
    const api = makeApi();
    const provider = new ExpoNotificationProvider(api);
    expect(await provider.requestPermission()).toBe(true);
  });

  it('notify schedules an immediate (null-trigger) local notification', async () => {
    const api = makeApi();
    const provider = new ExpoNotificationProvider(api);
    await provider.notify('Hi', 'Body');
    expect((api as never as { scheduleNotificationAsync: ReturnType<typeof vi.fn> }).scheduleNotificationAsync).toHaveBeenCalledWith({
      content: { title: 'Hi', body: 'Body' },
      trigger: null,
    });
  });

  it('registerForPush returns the Expo token data', async () => {
    const api = makeApi({
      getPermissionsAsync: vi.fn(async () => ({ status: 'granted', granted: true })),
    });
    const provider = new ExpoNotificationProvider(api, { projectId: 'p1' });
    expect(await provider.registerForPush()).toBe('ExponentPushToken[abc]');
  });

  it('registerForPush returns null when permission denied', async () => {
    const api = makeApi({
      getPermissionsAsync: vi.fn(async () => ({ status: 'denied', granted: false })),
      requestPermissionsAsync: vi.fn(async () => ({ status: 'denied', granted: false })),
    });
    const provider = new ExpoNotificationProvider(api);
    expect(await provider.registerForPush()).toBeNull();
  });

  it('registerForPush returns null when token fetch throws', async () => {
    const api = makeApi({
      getPermissionsAsync: vi.fn(async () => ({ status: 'granted', granted: true })),
      getExpoPushTokenAsync: vi.fn(async () => {
        throw new Error('no token on simulator');
      }),
    });
    const provider = new ExpoNotificationProvider(api);
    expect(await provider.registerForPush()).toBeNull();
  });
});

describe('RevenueCatBillingProvider', () => {
  const customerInfo = (activeIds: string[]) => ({
    entitlements: {
      active: Object.fromEntries(
        activeIds.map((id) => [id, { identifier: id, isActive: true }]),
      ),
    },
  });

  function makeApi(over: Partial<Record<string, unknown>> = {}) {
    return {
      getCustomerInfo: vi.fn(async () => customerInfo([])),
      getOfferings: vi.fn(async () => ({ current: null, all: {} })),
      purchasePackage: vi.fn(),
      restorePurchases: vi.fn(async () => customerInfo([])),
      ...over,
    } as never;
  }

  it('maps an active coach entitlement to "coach" (highest tier wins)', async () => {
    const api = makeApi({ getCustomerInfo: vi.fn(async () => customerInfo(['pro', 'coach'])) });
    const provider = new RevenueCatBillingProvider(api);
    expect(await provider.getEntitlement()).toBe('coach');
  });

  it('maps an active pro entitlement to "pro"', async () => {
    const api = makeApi({ getCustomerInfo: vi.fn(async () => customerInfo(['pro'])) });
    const provider = new RevenueCatBillingProvider(api);
    expect(await provider.getEntitlement()).toBe('pro');
  });

  it('maps no active entitlements to "free"', async () => {
    const provider = new RevenueCatBillingProvider(makeApi());
    expect(await provider.getEntitlement()).toBe('free');
  });

  it('ignores entitlements that are present but inactive', async () => {
    const api = makeApi({
      getCustomerInfo: vi.fn(async () => ({
        entitlements: { active: {} },
      })),
    });
    const provider = new RevenueCatBillingProvider(api);
    expect(await provider.getEntitlement()).toBe('free');
  });

  it('respects a custom entitlement identifier map', async () => {
    const api = makeApi({ getCustomerInfo: vi.fn(async () => customerInfo(['premium'])) });
    const provider = new RevenueCatBillingProvider(api, { coach: 'elite', pro: 'premium' });
    expect(await provider.getEntitlement()).toBe('pro');
  });

  it('purchase finds the package by product id, buys it, and reports success', async () => {
    const pkg = { identifier: 'monthly', product: { identifier: 'pro_monthly' } };
    const purchasePackage = vi.fn(async () => ({ customerInfo: customerInfo(['pro']) }));
    const api = makeApi({
      getOfferings: vi.fn(async () => ({
        current: { availablePackages: [pkg] },
        all: {},
      })),
      purchasePackage,
    });
    const provider = new RevenueCatBillingProvider(api);
    expect(await provider.purchase('pro_monthly')).toBe(true);
    expect(purchasePackage).toHaveBeenCalledWith(pkg);
  });

  it('purchase returns false when the product id is not in any offering', async () => {
    const provider = new RevenueCatBillingProvider(makeApi());
    expect(await provider.purchase('ghost')).toBe(false);
  });

  it('purchase returns false when the SDK throws (cancellation)', async () => {
    const pkg = { identifier: 'monthly', product: { identifier: 'pro_monthly' } };
    const api = makeApi({
      getOfferings: vi.fn(async () => ({ current: { availablePackages: [pkg] }, all: {} })),
      purchasePackage: vi.fn(async () => {
        throw new Error('user cancelled');
      }),
    });
    const provider = new RevenueCatBillingProvider(api);
    expect(await provider.purchase('pro_monthly')).toBe(false);
  });

  it('restore delegates to restorePurchases', async () => {
    const restorePurchases = vi.fn(async () => customerInfo([]));
    const provider = new RevenueCatBillingProvider(makeApi({ restorePurchases }));
    await provider.restore();
    expect(restorePurchases).toHaveBeenCalled();
  });
});
