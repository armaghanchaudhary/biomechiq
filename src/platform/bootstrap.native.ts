// src/platform/bootstrap.native.ts
// Native (iOS/Android) composition. Selected automatically by Metro's platform extensions.
// Adapters are wired here incrementally as they land (BIOM-17+).

import { registerDomainDefaults } from './container';

export function bootstrap(): void {
  registerDomainDefaults();

  // --- wired incrementally as adapters are implemented ---
  // register('cameraSource', new VisionCameraSource());            // BIOM-17
  // register('poseProvider', new MediaPipePoseProvider());         // BIOM-18
  // register('objectDetector', new TfliteYoloDetector());          // BIOM-19
  // register('overlayRenderer', new SkiaOverlayRenderer());        // BIOM-20
  // register('recorder', new VisionCameraRecorder());              // BIOM-31
  // register('calibrationStrategy', new ReferenceObjectCalibration()); // BIOM-23
  // register('coachingProvider', new ClaudeCoachingProvider());    // BIOM-27
  // register('sessionRepository', new SupabaseSessionRepository());// BIOM-35
  // register('mediaStorage', new SupabaseMediaStorage());          // BIOM-36
  // register('authProvider', new SupabaseAuthProvider());          // BIOM-35
  // register('billingProvider', new RevenueCatBilling());          // BIOM-58
  // register('analyticsSink', new PostHogSentrySink());            // BIOM-61
  // register('notificationProvider', new ExpoNotifications());     // BIOM-54
  // register('chartRenderer', new VictoryNativeRenderer());        // BIOM-39
}
