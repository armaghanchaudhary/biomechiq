// test/onboarding.test.ts
// Deterministic tests for the pure first-run onboarding state machine.

import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_STEPS,
  OnboardingStep,
  initOnboarding,
  advance,
  back,
  completeStep,
  chooseSport,
  goToStep,
  isComplete,
  progressPercent,
  canAdvance,
  canGoBack,
} from '@/domain/services/onboarding';

describe('initOnboarding', () => {
  it('starts at the first step with nothing completed', () => {
    const s = initOnboarding();
    expect(s.current).toBe('welcome');
    expect(s.completed).toEqual([]);
    expect(s.sport).toBeNull();
    expect(isComplete(s)).toBe(false);
    expect(progressPercent(s)).toBe(0);
  });

  it('accepts an initial sport', () => {
    expect(initOnboarding('tennis').sport).toBe('tennis');
  });
});

describe('advance — full forward path', () => {
  it('walks every step in order to done and completes onboarding', () => {
    let s = initOnboarding();
    const visited: OnboardingStep[] = [s.current];

    // Advance until the cursor stops moving (reaches the final step).
    for (let i = 0; i < ONBOARDING_STEPS.length + 2; i++) {
      const next = advance(s);
      if (next.current !== s.current) visited.push(next.current);
      s = next;
    }

    expect(visited).toEqual([...ONBOARDING_STEPS]);
    expect(s.current).toBe('done');
    expect(isComplete(s)).toBe(true);
    expect(progressPercent(s)).toBe(100);
  });

  it('does not mutate the input state', () => {
    const s = initOnboarding();
    const snapshot = JSON.stringify(s);
    advance(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('marks the current step complete when advancing', () => {
    const s = advance(initOnboarding());
    expect(s.completed).toContain('welcome');
    expect(s.current).toBe('pick-sport');
  });
});

describe('back', () => {
  it('returns to the previous step', () => {
    const forward = advance(advance(initOnboarding())); // -> camera-primer
    expect(forward.current).toBe('camera-primer');
    const b = back(forward);
    expect(b.current).toBe('pick-sport');
  });

  it('no-ops on the first step', () => {
    const s = initOnboarding();
    expect(back(s).current).toBe('welcome');
  });

  it('does not un-complete steps', () => {
    const forward = advance(advance(initOnboarding()));
    const b = back(forward);
    expect(b.completed).toEqual(forward.completed);
    expect(b.completed).toContain('welcome');
  });
});

describe('completeStep — idempotent', () => {
  it('records a step once', () => {
    const s = completeStep(initOnboarding(), 'camera-primer');
    expect(s.completed).toEqual(['camera-primer']);
  });

  it('completing the same step twice does not duplicate', () => {
    const once = completeStep(initOnboarding(), 'welcome');
    const twice = completeStep(once, 'welcome');
    expect(twice.completed).toEqual(['welcome']);
    expect(twice.completed).toHaveLength(1);
  });

  it('does not mutate the input', () => {
    const s = initOnboarding();
    completeStep(s, 'welcome');
    expect(s.completed).toEqual([]);
  });
});

describe('progressPercent', () => {
  it('is 0 with nothing completed', () => {
    expect(progressPercent(initOnboarding())).toBe(0);
  });

  it('grows as non-final steps complete', () => {
    // 5 non-final steps -> each is 20%.
    let s = completeStep(initOnboarding(), 'welcome');
    expect(progressPercent(s)).toBe(20);
    s = completeStep(s, 'pick-sport');
    expect(progressPercent(s)).toBe(40);
  });

  it('ignores completing only the done step for partial progress', () => {
    const s = completeStep(initOnboarding(), 'done');
    // done is excluded from the denominator, so no non-final work registered.
    expect(progressPercent(s)).toBe(0);
    expect(isComplete(s)).toBe(true);
  });
});

describe('isComplete', () => {
  it('is false until the final step is completed', () => {
    let s = initOnboarding();
    for (const step of ONBOARDING_STEPS.slice(0, -1)) {
      s = completeStep(s, step);
      expect(isComplete(s)).toBe(false);
    }
    s = completeStep(s, 'done');
    expect(isComplete(s)).toBe(true);
  });
});

describe('chooseSport / goToStep / guards', () => {
  it('records the chosen sport without moving the cursor', () => {
    const s = chooseSport(initOnboarding(), 'golf');
    expect(s.sport).toBe('golf');
    expect(s.current).toBe('welcome');
  });

  it('jumps the cursor with goToStep', () => {
    expect(goToStep(initOnboarding(), 'first-session').current).toBe('first-session');
  });

  it('canAdvance / canGoBack reflect cursor position', () => {
    const start = initOnboarding();
    expect(canGoBack(start)).toBe(false);
    expect(canAdvance(start)).toBe(true);

    const end = goToStep(start, 'done');
    expect(canAdvance(end)).toBe(false);
    expect(canGoBack(end)).toBe(true);
  });
});
