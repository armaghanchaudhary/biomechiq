// src/domain/services/onboarding.ts
// First-run onboarding finite state machine.
// PURE domain service — no React, Expo, vendor SDK, or port imports.
//
// Models the linear first-run flow as an ordered list of steps with a cursor
// and a set of completed steps. Every transition is a pure function: it takes
// the current state and returns a NEW state, never mutating the input and never
// performing side effects. Persistence / navigation are the adapter's concern.

import { Sport } from '../types';

// ── Steps ─────────────────────────────────────────────

/**
 * Ordered first-run steps. The order of this tuple defines the flow; the array
 * below is derived from it so the sequence lives in exactly one place.
 */
export type OnboardingStep =
  | 'welcome'
  | 'pick-sport'
  | 'camera-primer'
  | 'calibration-intro'
  | 'first-session'
  | 'done';

/** Canonical step order. Index in this array == progress position. */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'welcome',
  'pick-sport',
  'camera-primer',
  'calibration-intro',
  'first-session',
  'done',
] as const;

/** The terminal step. Reaching it means onboarding is finished. */
export const FINAL_STEP: OnboardingStep = 'done';

// ── State ─────────────────────────────────────────────

export interface OnboardingState {
  /** The step currently being shown to the user. */
  current: OnboardingStep;
  /** Steps the user has explicitly completed (order-independent set). */
  completed: readonly OnboardingStep[];
  /** Sport chosen during the `pick-sport` step, if any. */
  sport: Sport | null;
}

/** A fresh onboarding state positioned at the first step. */
export function initOnboarding(sport: Sport | null = null): OnboardingState {
  return {
    current: ONBOARDING_STEPS[0],
    completed: [],
    sport,
  };
}

// ── Helpers ───────────────────────────────────────────

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

function hasCompleted(state: OnboardingState, step: OnboardingStep): boolean {
  return state.completed.includes(step);
}

// ── Transitions (all pure, all return new state) ──────

/**
 * Move forward to the next step. Marks the current step complete on the way.
 * No-ops (returns an equal-valued new state) when already on the final step.
 */
export function advance(state: OnboardingState): OnboardingState {
  const idx = stepIndex(state.current);
  // Marking the current step complete is part of advancing.
  const withCurrent = completeStep(state, state.current);

  if (idx >= ONBOARDING_STEPS.length - 1) {
    // Already at the end — still record completion of the final step.
    return withCurrent;
  }

  return { ...withCurrent, current: ONBOARDING_STEPS[idx + 1] };
}

/**
 * Move back to the previous step. No-ops when already on the first step.
 * Going back does NOT un-complete any step.
 */
export function back(state: OnboardingState): OnboardingState {
  const idx = stepIndex(state.current);
  if (idx <= 0) return { ...state };
  return { ...state, current: ONBOARDING_STEPS[idx - 1] };
}

/**
 * Mark a step complete. Idempotent — completing an already-completed step
 * returns equivalent state and never duplicates entries.
 */
export function completeStep(
  state: OnboardingState,
  step: OnboardingStep,
): OnboardingState {
  if (hasCompleted(state, step)) return { ...state };
  return { ...state, completed: [...state.completed, step] };
}

/** Record the chosen sport (used by the `pick-sport` step). Pure. */
export function chooseSport(state: OnboardingState, sport: Sport): OnboardingState {
  return { ...state, sport };
}

/** Jump the cursor to an arbitrary valid step without altering completion. */
export function goToStep(state: OnboardingState, step: OnboardingStep): OnboardingState {
  if (stepIndex(step) < 0) return { ...state };
  return { ...state, current: step };
}

// ── Queries ───────────────────────────────────────────

/** Onboarding is complete once the final step has been completed. */
export function isComplete(state: OnboardingState): boolean {
  return hasCompleted(state, FINAL_STEP);
}

/**
 * Progress through the flow as an integer percentage 0–100, based on how many
 * of the non-final steps have been completed. The `done` step is the finish
 * line, not a unit of work, so it is excluded from the denominator.
 */
export function progressPercent(state: OnboardingState): number {
  const total = ONBOARDING_STEPS.length - 1; // exclude the terminal 'done'
  if (total <= 0) return 100;
  const doneCount = ONBOARDING_STEPS.slice(0, total).filter((s) =>
    hasCompleted(state, s),
  ).length;
  return Math.round((doneCount / total) * 100);
}

/** True when there is a step after the current one. */
export function canAdvance(state: OnboardingState): boolean {
  return stepIndex(state.current) < ONBOARDING_STEPS.length - 1;
}

/** True when there is a step before the current one. */
export function canGoBack(state: OnboardingState): boolean {
  return stepIndex(state.current) > 0;
}
