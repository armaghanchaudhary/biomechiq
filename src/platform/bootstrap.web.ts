// src/platform/bootstrap.web.ts
// Web composition. Selected automatically by Metro's platform extensions.
// Web uses different adapters for the same ports (getUserMedia, tasks-vision, etc).

import { registerDomainDefaults } from './container';

export function bootstrap(): void {
  registerDomainDefaults();

  // --- web adapters, wired incrementally ---
  // register('cameraSource', new GetUserMediaSource());            // BIOM-17
  // register('poseProvider', new TasksVisionPoseProvider());       // BIOM-18 (web)
  // register('objectDetector', new ColorSamplerDetector());        // BIOM-19 (web fallback)
  // register('overlayRenderer', new SkiaWebOverlayRenderer());     // BIOM-20
  // register('recorder', new MediaRecorderRecorder());             // BIOM-31
  // register('coachingProvider', new ClaudeCoachingProvider());    // BIOM-27
  // register('sessionRepository', new SupabaseSessionRepository());// BIOM-35
  // ... (remaining ports shared with native where possible)
}
