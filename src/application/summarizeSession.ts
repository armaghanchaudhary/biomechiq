// src/application/summarizeSession.ts
// Use case: SummarizeSession. Given a freshly completed session plus the user's
// prior history, produce ONE post-session engagement summary by COMPOSING the
// existing pure domain services (personal bests, goals, streaks, achievements,
// best rep). This layer only orchestrates — it never re-derives their logic.
//
// Application layer rules: imports only from @/domain (and @/ports type-only).
// No React, no Expo, no vendor SDK, no repository invented here — all prior data
// is passed in as typed inputs so the use case stays deterministic and testable.

import {
  type SessionState,
  type SessionSummary,
  // personalBests
  updatePersonalBests,
  type PersonalBest,
  type PersonalBestsResult,
  // goals
  evaluateGoals,
  type Goal,
  type GoalProgress,
  // streaks
  computeStreak,
  type StreakConfig,
  type StreakResult,
  // achievements
  evaluateAchievements,
  type AchievementDef,
  type AwardedAchievement,
  // bestRep
  selectBestRep,
  type Rep,
  type RepFormScore,
  type BestRepConfig,
  type ScoredRep,
} from '@/domain';

/**
 * Everything the use case needs about the user's prior state. None of this is
 * fetched here — the caller (composition root / adapter) supplies it, keeping
 * this use case a pure orchestration of domain services.
 */
export interface SummarizeSessionInput {
  /** The session that just finished, in its canonical persisted shape. */
  session: SessionSummary;
  /** The user's personal bests *before* this session. */
  priorBests: PersonalBest[];
  /** The user's currently active goals. */
  activeGoals: Goal[];
  /**
   * Epoch-millisecond timestamps of the user's prior completed sessions
   * (excluding this one — the use case appends this session's time).
   */
  priorSessionTimestampsMs: number[];
  /** Achievement ids the user has already unlocked (won't be re-awarded). */
  unlockedAchievementIds: string[];
  /** Reps segmented from this session, for highlight selection. */
  reps?: Rep[];
  /** Per-rep form scores (keyed by Rep.index), for blended best-rep ranking. */
  repFormScores?: RepFormScore[];
  /** Lifetime session count *including* this session. */
  totalSessions: number;
  /** Lifetime throw count *including* this session. */
  totalThrows: number;
  /**
   * Current moment, ISO timestamp — passed to goal evaluation so the layer
   * never reads the clock itself.
   */
  now: string;
  /** Current moment in epoch ms — passed to streak computation. */
  nowMs: number;
}

/**
 * Tunable knobs for the composed domain services. All optional; sensible
 * domain-level defaults apply when omitted.
 */
export interface SummarizeSessionConfig {
  /** Streak cadence (defaults to daily). */
  streak?: StreakConfig;
  /** Best-rep speed/form weighting. */
  bestRep?: Partial<BestRepConfig>;
  /** Achievement rule set (defaults to DEFAULT_ACHIEVEMENTS in the domain). */
  achievementRules?: AchievementDef[];
}

export interface SummarizeSessionDeps {
  config?: SummarizeSessionConfig;
}

/**
 * The aggregated post-session result. Each field reuses the *return type* of the
 * domain service that produced it — nothing is re-derived or re-shaped here.
 */
export interface SessionSummaryResult {
  /** The session this summary is for. */
  session: SessionSummary;
  /** Updated PB set + records broken (from updatePersonalBests). */
  personalBests: PersonalBestsResult;
  /** Progress for every active goal (from evaluateGoals). */
  goals: GoalProgress[];
  /** Goals that flipped to "achieved" this session. */
  completedGoals: GoalProgress[];
  /** Updated streak after counting this session (from computeStreak). */
  streak: StreakResult;
  /** Newly unlocked achievements (from evaluateAchievements). */
  newAchievements: AwardedAchievement[];
  /** The single highlight rep, or null when the session had no reps. */
  bestRep: ScoredRep | null;
}

const DEFAULT_STREAK_CONFIG: StreakConfig = { cadence: 'daily' };

/**
 * Build the SummarizeSession use case.
 *
 * Returned function is synchronous and pure given its inputs: it composes the
 * domain services and aggregates their own return types into a single result.
 */
export function makeSummarizeSession(deps: SummarizeSessionDeps = {}) {
  const streakConfig = deps.config?.streak ?? DEFAULT_STREAK_CONFIG;
  const bestRepConfig = deps.config?.bestRep;
  const achievementRules = deps.config?.achievementRules;

  return (input: SummarizeSessionInput): SessionSummaryResult => {
    const { session } = input;

    // 1) Personal bests — does this session break any prior record?
    const personalBests = updatePersonalBests(input.priorBests, session);

    // 2) Goals — progress for every active goal; surface ones completed now.
    const goals = evaluateGoals(input.activeGoals, [session], input.now);
    const completedGoals = goals.filter((g) => g.status === 'achieved');

    // 3) Streak — fold this session's time into the prior history.
    const timestamps = [...input.priorSessionTimestampsMs];
    if (Number.isFinite(input.nowMs)) {
      // Use the session's own time when parseable, else fall back to nowMs.
      const sessionMs = Date.parse(session.createdAt);
      timestamps.push(Number.isFinite(sessionMs) ? sessionMs : input.nowMs);
    }
    const streak = computeStreak(timestamps, streakConfig, input.nowMs);

    // 4) Achievements — evaluate the post-session snapshot, excluding held ids.
    const newAchievements = evaluateAchievements(
      {
        session,
        totalSessions: input.totalSessions,
        totalThrows: input.totalThrows,
        currentStreak: streak.current,
        setPersonalBest: personalBests.newRecord,
      },
      input.unlockedAchievementIds,
      achievementRules,
    );

    // 5) Best rep — highlight selection for the auto-clip.
    const bestRep = selectBestRep(
      input.reps ?? [],
      input.repFormScores ?? [],
      bestRepConfig ?? {},
    );

    return {
      session,
      personalBests,
      goals,
      completedGoals,
      streak,
      newAchievements,
      bestRep,
    };
  };
}

/**
 * Helper: derive the canonical {@link SessionSummary} from a live
 * {@link SessionState}. Callers that only hold the in-flight session state can
 * map it before invoking the use case. Pure — `createdAt` must be supplied by
 * the caller (this layer never reads the clock).
 */
export function sessionStateToSummary(
  state: SessionState,
  userId: string,
  createdAt: string,
): SessionSummary {
  return {
    id: state.id,
    userId,
    sport: state.sport,
    createdAt,
    durationSecs: state.duration,
    peakSpeedKmh: state.peakSpeed,
    avgSpeedKmh: state.avgSpeed,
    formScore: state.formScore,
    throwCount: state.throwCount,
  };
}
