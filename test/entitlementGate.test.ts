// test/entitlementGate.test.ts
// Tests for the entitlement gate: pure access matrices + port-driven canUse.

import { describe, it, expect, vi } from 'vitest';
import {
  makeEntitlementGate,
  featuresFor,
  entitlementUnlocks,
  ALL_FEATURES,
  Feature,
} from '@/application/entitlementGate';
import type { BillingProvider, Entitlement } from '@/ports';

/** Minimal fake BillingProvider returning a fixed entitlement. */
function fakeBilling(entitlement: Entitlement): BillingProvider {
  return {
    getEntitlement: vi.fn(async () => entitlement),
    purchase: vi.fn(async () => true),
    restore: vi.fn(async () => {}),
  };
}

describe('featuresFor — access matrices', () => {
  it('free unlocks nothing', () => {
    const m = featuresFor('free');
    expect(Object.values(m).every((v) => v === false)).toBe(true);
  });

  it('pro unlocks pro-tier features but not leaderboards', () => {
    const m = featuresFor('pro');
    expect(m.unlimitedSessions).toBe(true);
    expect(m.aiCoaching).toBe(true);
    expect(m.advancedAnalytics).toBe(true);
    expect(m.videoExport).toBe(true);
    expect(m.leaderboards).toBe(false);
  });

  it('coach unlocks everything pro does and more', () => {
    const m = featuresFor('coach');
    expect(Object.values(m).every((v) => v === true)).toBe(true);
  });

  it('higher tiers are supersets of lower tiers', () => {
    for (const feature of ALL_FEATURES) {
      if (featuresFor('free')[feature]) expect(featuresFor('pro')[feature]).toBe(true);
      if (featuresFor('pro')[feature]) expect(featuresFor('coach')[feature]).toBe(true);
    }
  });
});

describe('entitlementUnlocks', () => {
  it('agrees with featuresFor', () => {
    const tiers: Entitlement[] = ['free', 'pro', 'coach'];
    for (const t of tiers) {
      for (const f of ALL_FEATURES) {
        expect(entitlementUnlocks(t, f)).toBe(featuresFor(t)[f]);
      }
    }
  });
});

describe('makeEntitlementGate — canUse calls the port', () => {
  it('reads entitlement from billing on each canUse call', async () => {
    const billing = fakeBilling('pro');
    const gate = makeEntitlementGate(billing);

    expect(await gate.canUse('aiCoaching')).toBe(true);
    expect(await gate.canUse('leaderboards')).toBe(false);

    expect(billing.getEntitlement).toHaveBeenCalledTimes(2);
  });

  it('free user is denied gated features', async () => {
    const gate = makeEntitlementGate(fakeBilling('free'));
    const denied: Feature[] = ['unlimitedSessions', 'aiCoaching', 'leaderboards'];
    for (const f of denied) {
      expect(await gate.canUse(f)).toBe(false);
    }
  });

  it('coach user is granted every feature', async () => {
    const gate = makeEntitlementGate(fakeBilling('coach'));
    for (const f of ALL_FEATURES) {
      expect(await gate.canUse(f)).toBe(true);
    }
  });

  it('currentFeatures returns the full live matrix', async () => {
    const billing = fakeBilling('pro');
    const gate = makeEntitlementGate(billing);
    const m = await gate.currentFeatures();
    expect(m).toEqual(featuresFor('pro'));
    expect(billing.getEntitlement).toHaveBeenCalledTimes(1);
  });

  it('reflects entitlement changes between calls', async () => {
    let tier: Entitlement = 'free';
    const billing: BillingProvider = {
      getEntitlement: vi.fn(async () => tier),
      purchase: vi.fn(async () => true),
      restore: vi.fn(async () => {}),
    };
    const gate = makeEntitlementGate(billing);

    expect(await gate.canUse('aiCoaching')).toBe(false);
    tier = 'pro';
    expect(await gate.canUse('aiCoaching')).toBe(true);
  });
});
