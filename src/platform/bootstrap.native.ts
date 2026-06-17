// src/platform/bootstrap.native.ts
// Native (iOS/Android) composition. Selected automatically by Metro's platform extensions.
// Only pure-JS, cross-platform adapters are wired today; native-only and live-engine
// adapters are uncommented as their features land.

import { registerDomainDefaults, register } from './container';
import { ClaudeCoachingProvider } from '@/adapters/claude/claudeCoachingProvider';
import { TemplatedCoachingProvider } from '@/adapters/coaching/templatedCoachingProvider';
import { CoachingWithFallback } from '@/adapters/coaching/coachingWithFallback';
import { ReferenceObjectCalibration } from '@/adapters/calibration/referenceObjectCalibration';
import { SupabaseSessionRepository } from '@/adapters/supabase/sessionRepository';
import { SupabaseMediaStorage } from '@/adapters/supabase/mediaStorage';
import { SupabaseAuthProvider } from '@/adapters/supabase/authProvider';

export function bootstrap(): void {
  registerDomainDefaults(); // speedEstimator = domain SpeedEngine

  // Cross-platform adapters (pure JS / network only) — safe on native + web.
  register(
    'coachingProvider',
    new CoachingWithFallback(new ClaudeCoachingProvider(), new TemplatedCoachingProvider())
  ); // BIOM-27/28/30 — Claude with offline templated fallback
  register('calibrationStrategy', new ReferenceObjectCalibration()); // BIOM-23
  register('sessionRepository', new SupabaseSessionRepository());  // BIOM-35
  register('mediaStorage', new SupabaseMediaStorage());           // BIOM-36
  register('authProvider', new SupabaseAuthProvider());           // BIOM-35

  // --- native-only adapters (wire when their feature lands) ---
  // import { CompositeAnalyticsSink } from '@/adapters/analytics/compositeAnalyticsSink';
  // import { SentryAnalyticsSink } from '@/adapters/analytics/sentryAnalyticsSink';
  // register('analyticsSink', new CompositeAnalyticsSink([new SentryAnalyticsSink()])); // BIOM-61
  // import { ExpoNotificationProvider } from '@/adapters/notifications/expoNotificationProvider';
  // register('notificationProvider', new ExpoNotificationProvider());                   // BIOM-54
  // import { RevenueCatBillingProvider } from '@/adapters/billing/revenueCatBillingProvider';
  // register('billingProvider', new RevenueCatBillingProvider());                       // BIOM-58

  // --- live-engine ports (BIOM-17..31) ---
  // register('cameraSource', new VisionCameraSource());
  // register('poseProvider', new MediaPipePoseProvider());
  // register('objectDetector', new TfliteYoloDetector());
  // register('overlayRenderer', new SkiaOverlayRenderer());
  // register('recorder', new VisionCameraRecorder());
}
