// src/adapters/billing/revenueCatBillingProvider.ts
// BillingProvider adapter backed by RevenueCat (react-native-purchases).
// Maps RevenueCat customerInfo entitlements onto the domain Entitlement tiers
// ('free' | 'pro' | 'coach') and drives package purchases / restores.

import Purchases from 'react-native-purchases';
import type { BillingProvider, Entitlement } from '@/ports';

/** A RevenueCat entitlement (only the fields we read). */
interface RcEntitlementInfo {
  readonly identifier: string;
  readonly isActive: boolean;
}

/** A RevenueCat customerInfo (only the fields we read). */
export interface RcCustomerInfo {
  readonly entitlements: {
    readonly active: { readonly [key: string]: RcEntitlementInfo };
  };
}

interface RcPackage {
  readonly identifier: string;
  readonly product: { readonly identifier: string };
}

interface RcOfferings {
  readonly current: { readonly availablePackages: RcPackage[] } | null;
  readonly all: { readonly [key: string]: { readonly availablePackages: RcPackage[] } };
}

/** The slice of the Purchases SDK this adapter uses; lets tests inject a fake. */
export interface PurchasesLike {
  getCustomerInfo(): Promise<RcCustomerInfo>;
  getOfferings(): Promise<RcOfferings>;
  purchasePackage(pkg: RcPackage): Promise<{ customerInfo: RcCustomerInfo }>;
  restorePurchases(): Promise<RcCustomerInfo>;
}

/**
 * Identifier of the highest tier wins. Entitlement identifiers are configured in
 * the RevenueCat dashboard; map them to domain tiers here (override via options
 * if the dashboard uses different names).
 */
export interface EntitlementMap {
  coach: string;
  pro: string;
}

const DEFAULT_ENTITLEMENT_MAP: EntitlementMap = { coach: 'coach', pro: 'pro' };

export class RevenueCatBillingProvider implements BillingProvider {
  private readonly api: PurchasesLike;
  private readonly entitlementMap: EntitlementMap;

  constructor(
    api: PurchasesLike = Purchases as unknown as PurchasesLike,
    entitlementMap: EntitlementMap = DEFAULT_ENTITLEMENT_MAP,
  ) {
    this.api = api;
    this.entitlementMap = entitlementMap;
  }

  async getEntitlement(): Promise<Entitlement> {
    const info = await this.api.getCustomerInfo();
    return this.mapEntitlement(info);
  }

  async purchase(productId: string): Promise<boolean> {
    const pkg = await this.findPackage(productId);
    if (!pkg) return false;
    try {
      const { customerInfo } = await this.api.purchasePackage(pkg);
      // Purchase succeeds only if it actually lifts the user above the free tier.
      return this.mapEntitlement(customerInfo) !== 'free';
    } catch {
      // User cancellation or a billing error — treat as a non-purchase.
      return false;
    }
  }

  async restore(): Promise<void> {
    await this.api.restorePurchases();
  }

  /** Highest active tier the customerInfo grants. */
  private mapEntitlement(info: RcCustomerInfo): Entitlement {
    const active = info?.entitlements?.active ?? {};
    if (this.isActive(active, this.entitlementMap.coach)) return 'coach';
    if (this.isActive(active, this.entitlementMap.pro)) return 'pro';
    return 'free';
  }

  private isActive(
    active: { readonly [key: string]: RcEntitlementInfo },
    id: string,
  ): boolean {
    const ent = active[id];
    return ent?.isActive === true;
  }

  /** Look up a package by package identifier or by underlying store product id. */
  private async findPackage(productId: string): Promise<RcPackage | null> {
    const offerings = await this.api.getOfferings();
    const offeringList = [
      ...(offerings.current ? [offerings.current] : []),
      ...Object.values(offerings.all ?? {}),
    ];
    for (const offering of offeringList) {
      for (const pkg of offering.availablePackages ?? []) {
        if (pkg.identifier === productId || pkg.product?.identifier === productId) {
          return pkg;
        }
      }
    }
    return null;
  }
}
