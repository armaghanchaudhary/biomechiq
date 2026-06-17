// test/replaceability.test.ts
// BIOM-15 — proves the hexagonal seam: swapping an adapter in the container
// changes behaviour with ZERO changes to the domain or application layers.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  register,
  resolve,
  resetContainer,
  registerDomainDefaults,
} from '@/platform/container';
import {
  makeGenerateCoaching,
  makeAnalyzeFrame,
  type SessionMetricsSnapshot,
} from '@/application';
import { TemplatedCoachingProvider } from '@/adapters/coaching/templatedCoachingProvider';
import type {
  CoachingProvider,
  CoachingContext,
  CoachingResponse,
  ChatMessage,
  SpeedEstimator,
} from '@/ports';
import type { TrackedObject } from '@/domain';

// --- Alternative adapters (stand-ins for, e.g., a Claude adapter / AR-depth estimator) ---

class ShoutyCoachingProvider implements CoachingProvider {
  async generateFeedback(ctx: CoachingContext): Promise<CoachingResponse> {
    return { text: `FORM ${ctx.formScore} — LET'S GO!`, tips: ctx.jointFeedback };
  }
  async chat(_h: ChatMessage[], _ctx: CoachingContext): Promise<string> {
    return 'YES';
  }
}

class FixedSpeedEstimator implements SpeedEstimator {
  constructor(private readonly value: number) {}
  update(): number {
    return this.value;
  }
  objectLost(): void {}
  getPeakSpeed(): number {
    return this.value;
  }
  resetSession(): void {}
  setCalibration(): void {}
}

const snapshot: SessionMetricsSnapshot = {
  sport: 'tennis',
  formScore: 72,
  peakSpeedKmh: 0,
  avgSpeedKmh: 0,
  tips: [],
};

describe('replaceability: swap an adapter via the container, no domain/application changes', () => {
  beforeEach(() => resetContainer());

  it('CoachingProvider: same use case, different adapter → different output', async () => {
    register('coachingProvider', new TemplatedCoachingProvider());
    const templated = makeGenerateCoaching(resolve('coachingProvider'));
    const resA = await templated.feedback(snapshot);

    resetContainer();
    register('coachingProvider', new ShoutyCoachingProvider());
    const shouty = makeGenerateCoaching(resolve('coachingProvider'));
    const resB = await shouty.feedback(snapshot);

    // makeGenerateCoaching (application) + the domain were untouched — only the
    // registered adapter changed.
    expect(resA.text).not.toEqual(resB.text);
    expect(resB.text).toContain("LET'S GO");
  });

  it('SpeedEstimator: swapping the adapter changes analyzeFrame output', () => {
    const object: TrackedObject = {
      x: 0.5,
      y: 0.5,
      width: 0.1,
      height: 0.1,
      confidence: 0.9,
      label: 'sports ball',
    };
    const input = {
      sport: 'baseball' as const,
      landmarks: null,
      object,
      frameWidth: 1920,
      frameHeight: 1080,
      timestampMs: 1000,
    };

    register('speedEstimator', new FixedSpeedEstimator(120));
    const analyzeA = makeAnalyzeFrame(resolve('speedEstimator'));
    expect(analyzeA(input).speedKmh).toBe(120);

    resetContainer();
    register('speedEstimator', new FixedSpeedEstimator(45));
    const analyzeB = makeAnalyzeFrame(resolve('speedEstimator'));
    expect(analyzeB(input).speedKmh).toBe(45);
  });

  it('registerDomainDefaults binds the real domain SpeedEngine by default', () => {
    registerDomainDefaults();
    const speed = resolve('speedEstimator');
    expect(typeof speed.update).toBe('function');
    expect(typeof speed.getPeakSpeed).toBe('function');
  });

  it('resolve throws a helpful error when no adapter is registered', () => {
    expect(() => resolve('coachingProvider')).toThrowError(/No adapter registered/);
  });
});
