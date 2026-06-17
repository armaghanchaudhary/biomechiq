// src/application/entitlementGate.ts
// Use case: EntitlementGate. Maps the current billing Entitlement to feature
// access. Depends only on @/domain (none needed here) + the @/ports BillingProvider
// contract — no adapters, React, Expo, or vendor SDK imports.

import type { BillingProvider, Entitlement } from '@/ports';

// ── Feature catalog ───────────────────────────────────

/** Gated capabilities the app can sell behind a tier. */
export type Feature =
  | 'unlimitedSessions'
  | 'aiCoaching'
  | 'advancedAnalytics'
  | 'leaderboards'
  | 'videoExport';

/**
 * The minimum tier that unlocks each feature. Tiers are ordered
 * free < pro < coach, so any tier at or above the listed one has access.
 */
const FEATURE_MIN_TIER: Record<Feature, Entitlement> = {
  unlimitedSessions: 'pro',
  aiCoaching: 'pro',
  advancedAnalytics: 'pro',
  videoExport: 'pro',
  leaderboards: 'coach',
};

/** Ordering of entitlements from least to most privileged. */
const TIER_RANK: Record<Entitlement, number> = {
  free: 0,
  pro: 1,
  coach: 2,
};

/** All known features, in declaration order. */
export const ALL_FEATURES: readonly Feature[] = Object.keys(
  FEATURE_MIN_TIER,
) as Feature[];

/** Pure: does `entitlement` meet the minimum tier required by `feature`? */
export function entitlementUnlocks(
  entitlement: Entitlement,
  feature: Feature,
): boolean {
  return TIER_RANK[entitlement] >= TIER_RANK[FEATURE_MIN_TIER[feature]];
}

/**
 * Pure: the full access matrix for a given entitlement. Higher tiers are
 * supersets of lower ones, so `coach` unlocks everything `pro` does and more.
 */
export function featuresFor(entitlement: Entitlement): Record<Feature, boolean> {
  const access = {} as Record<Feature, boolean>;
  for (const feature of ALL_FEATURES) {
    access[feature] = entitlementUnlocks(entitlement, feature);
  }
  return access;
}

// ── Use case ──────────────────────────────────────────

export interface EntitlementGate {
  /** Resolve the live entitlement and report access to a single feature. */
  canUse(feature: Feature): Promise<boolean>;
  /** Resolve the live entitlement and return its full access matrix. */
  currentFeatures(): Promise<Record<Feature, boolean>>;
}

/**
 * Builds an EntitlementGate over a BillingProvider. Each query reads the current
 * entitlement from the port so access reflects upgrades/downgrades immediately.
 */
export function makeEntitlementGate(billing: BillingProvider): EntitlementGate {
  return {
    async canUse(feature: Feature): Promise<boolean> {
      const entitlement = await billing.getEntitlement();
      return entitlementUnlocks(entitlement, feature);
    },
    async currentFeatures(): Promise<Record<Feature, boolean>> {
      const entitlement = await billing.getEntitlement();
      return featuresFor(entitlement);
    },
  };
}
