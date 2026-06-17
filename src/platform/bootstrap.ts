// src/platform/bootstrap.ts
// Default / fallback bootstrap (used by type-checking, tests, and any non-native/web target).
// Metro picks bootstrap.native.ts on iOS/Android and bootstrap.web.ts on web automatically.

import { registerDomainDefaults } from './container';

/** Wire adapters into the container for the current platform. */
export function bootstrap(): void {
  registerDomainDefaults();
}
