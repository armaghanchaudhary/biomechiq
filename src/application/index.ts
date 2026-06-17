// src/application/index.ts
// Barrel for application use cases. Depend only on @/domain + @/ports; wired by the
// composition root (src/platform/useCases.ts). Import via "@/application".

export * from './scoreForm';
export * from './analyzeFrame';
export * from './generateCoaching';
export * from './recordSession';
export * from './saveSession';
export * from './coachingChat';

// Composition use cases (wave 3)
export * from './summarizeSession';
export * from './progressViewModel';
export * from './analyzeSpeed';
export * from './entitlementGate';
