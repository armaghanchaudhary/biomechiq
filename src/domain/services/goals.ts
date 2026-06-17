// src/domain/services/goals.ts
// Goal progress evaluation. A goal targets a single metric (speed or form) for a
// sport; this computes progress toward it from completed sessions.
// PURE domain service: no React, no Expo, no vendor SDK, no Date.now().

import { SessionSummary, Sport } from '../types';

export type GoalMetric = 'peakSpeedKmh' | 'avgSpeedKmh' | 'formScore';

export interface Goal {
  id: string;
  sport: Sport;
  metric: GoalMetric;
  target: number;        // the value the user wants to reach
  createdAt: string;     // ISO timestamp
  deadline?: string;     // optional ISO timestamp
}

export type GoalStatus = 'active' | 'achieved' | 'expired';

export interface GoalProgress {
  goalId: string;
  status: GoalStatus;
  target: number;
  best: number;          // best relevant value observed so far (0 if none)
  remaining: number;     // how much is still needed (0 once achieved)
  fraction: number;      // 0..1 progress ratio (clamped)
  percent: number;       // 0..100, rounded
  achievedAt: string | null; // ISO timestamp of the session that hit the target
}

function metricValue(session: SessionSummary, metric: GoalMetric): number {
  switch (metric) {
    case 'peakSpeedKmh':
      return session.peakSpeedKmh;
    case 'avgSpeedKmh':
      return session.avgSpeedKmh;
    case 'formScore':
      return session.formScore;
  }
}

/**
 * Evaluate progress toward a single goal.
 *
 * Only sessions matching the goal's sport and created at/after the goal's
 * createdAt count toward it. The goal is "achieved" once any qualifying session
 * meets or exceeds the target (the earliest such session sets achievedAt). If
 * unmet and the deadline has passed (deadline < now), it is "expired".
 *
 * @param now ISO timestamp representing the current moment (caller-supplied).
 */
export function evaluateGoal(
  goal: Goal,
  sessions: SessionSummary[],
  now: string,
): GoalProgress {
  const relevant = sessions
    .filter((s) => s.sport === goal.sport && s.createdAt >= goal.createdAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let best = 0;
  let achievedAt: string | null = null;

  for (const session of relevant) {
    const value = metricValue(session, goal.metric);
    if (Number.isFinite(value) && value > best) best = value;
    if (achievedAt === null && value >= goal.target) {
      achievedAt = session.createdAt;
    }
  }

  const safeTarget = goal.target > 0 ? goal.target : 0;
  const fraction =
    safeTarget === 0 ? 1 : Math.max(0, Math.min(1, best / safeTarget));

  let status: GoalStatus;
  if (achievedAt !== null) {
    status = 'achieved';
  } else if (goal.deadline !== undefined && goal.deadline < now) {
    status = 'expired';
  } else {
    status = 'active';
  }

  return {
    goalId: goal.id,
    status,
    target: goal.target,
    best,
    remaining: achievedAt !== null ? 0 : Math.max(0, goal.target - best),
    fraction,
    percent: Math.round(fraction * 100),
    achievedAt,
  };
}

/** Evaluate a batch of goals against the same session history. */
export function evaluateGoals(
  goals: Goal[],
  sessions: SessionSummary[],
  now: string,
): GoalProgress[] {
  return goals.map((g) => evaluateGoal(g, sessions, now));
}
