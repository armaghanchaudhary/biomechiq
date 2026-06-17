// src/platform/bootstrap.web.ts
// Web composition. Selected automatically by Metro's platform extensions.
// The cross-platform adapters below are pure JS / fetch and run unchanged on web;
// web-specific live-engine adapters (getUserMedia, tasks-vision) are wired later.

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

  register(
    'coachingProvider',
    new CoachingWithFallback(new ClaudeCoachingProvider(), new TemplatedCoachingProvider())
  ); // BIOM-27/28/30 — Claude with offline templated fallback
  register('calibrationStrategy', new ReferenceObjectCalibration()); // BIOM-23
  register('sessionRepository', new SupabaseSessionRepository());  // BIOM-35
  register('mediaStorage', new SupabaseMediaStorage());           // BIOM-36
  register('authProvider', new SupabaseAuthProvider());           // BIOM-35

  // --- web live-engine adapters, wired incrementally ---
  // register('cameraSource', new GetUserMediaSource());           // BIOM-17
  // register('poseProvider', new TasksVisionPoseProvider());      // BIOM-18 (web)
  // register('objectDetector', new ColorSamplerDetector());       // BIOM-19 (web fallback)
  // register('overlayRenderer', new SkiaWebOverlayRenderer());    // BIOM-20
}
