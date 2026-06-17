// src/platform/container.ts
// Composition root. The ONLY place that knows which concrete adapter backs each port.
// Adapters register themselves at bootstrap; domain/application/UI only see port types.

import { SpeedEngine } from '@/domain';
import type {
  PoseProvider,
  ObjectDetector,
  CameraSource,
  Recorder,
  OverlayRenderer,
  SpeedEstimator,
  CalibrationStrategy,
  CoachingProvider,
  SessionRepository,
  MediaStorage,
  AuthProvider,
  BillingProvider,
  AnalyticsSink,
  NotificationProvider,
  ChartRenderer,
} from '@/ports';

/**
 * The full set of capability ports the app depends on. Swapping a framework =
 * register a different adapter here; nothing else in the codebase changes.
 */
export interface AppContainer {
  poseProvider: PoseProvider;
  objectDetector: ObjectDetector;
  cameraSource: CameraSource;
  recorder: Recorder;
  overlayRenderer: OverlayRenderer;
  speedEstimator: SpeedEstimator;
  calibrationStrategy: CalibrationStrategy;
  coachingProvider: CoachingProvider;
  sessionRepository: SessionRepository;
  mediaStorage: MediaStorage;
  authProvider: AuthProvider;
  billingProvider: BillingProvider;
  analyticsSink: AnalyticsSink;
  notificationProvider: NotificationProvider;
  chartRenderer: ChartRenderer;
}

const registry: Partial<AppContainer> = {};

/** Bind a concrete adapter to a port. Called by adapters during bootstrap(). */
export function register<K extends keyof AppContainer>(key: K, impl: AppContainer[K]): void {
  registry[key] = impl;
}

/** Resolve a port's adapter. Throws if nothing has been registered yet. */
export function resolve<K extends keyof AppContainer>(key: K): AppContainer[K] {
  const impl = registry[key];
  if (impl === undefined) {
    throw new Error(
      `[container] No adapter registered for port "${String(key)}". Did bootstrap() run for this platform?`
    );
  }
  return impl as AppContainer[K];
}

export function isRegistered<K extends keyof AppContainer>(key: K): boolean {
  return registry[key] !== undefined;
}

/** Reset all bindings (used by tests). */
export function resetContainer(): void {
  for (const key of Object.keys(registry) as (keyof AppContainer)[]) {
    delete registry[key];
  }
}

/**
 * Framework-free defaults available on every platform. SpeedEngine is pure
 * domain code and structurally satisfies the SpeedEstimator port.
 */
export function registerDomainDefaults(): void {
  if (!isRegistered('speedEstimator')) {
    register('speedEstimator', new SpeedEngine());
  }
}
