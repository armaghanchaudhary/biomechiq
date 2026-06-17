// src/platform/useCases.ts
// Composition-root assembler: resolves ports from the container and builds the
// application use cases. This is where the wiring lives, so the application layer
// stays free of any container/adapter coupling.

import { resolve } from './container';
import { makeAnalyzeFrame, makeComputeSpeed } from '@/application';

/**
 * Build the use cases whose adapters are already registered. As more adapters
 * land (BIOM-17+), wire their use cases here:
 *   generateCoaching: makeGenerateCoaching(resolve('coachingProvider'))   // BIOM-27
 *   recordSession:    makeRecordSession(resolve('recorder'))              // BIOM-31
 *   saveSession:      makeSaveSession({ repo, media, auth })              // BIOM-35/36
 */
export function createUseCases() {
  const speed = resolve('speedEstimator'); // registered by registerDomainDefaults()
  return {
    analyzeFrame: makeAnalyzeFrame(speed),
    computeSpeed: makeComputeSpeed(speed),
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
