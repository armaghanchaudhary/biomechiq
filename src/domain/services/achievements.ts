// src/domain/services/achievements.ts
// Achievement / badge rules engine. Given a stat snapshot (lifetime totals plus
// the just-finished session), evaluate a set of rules and award badges.
// PURE domain service: no React, no Expo, no vendor SDK, no Date.now().

import { SessionSummary, Sport } from '../types';

export type AchievementCategory = 'milestone' | 'personal_best' | 'consistency' | 'performance';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  /** Predicate over the snapshot. Returns true when the badge is earned. */
  predicate: (snapshot: AchievementSnapshot) => boolean;
}

export interface AchievementSnapshot {
  /** The session that just completed (the trigger for this evaluation). */
  session: SessionSummary;
  /** Lifetime number of sessions completed, including this one. */
  totalSessions: number;
  /** Lifetime throw count across all sessions, including this one. */
  totalThrows: number;
  /** Current streak length (see streaks.ts), in cadence windows. */
  currentStreak: number;
  /** True when this session set at least one personal best. */
  setPersonalBest: boolean;
  /** Per-sport session counts (including this one), keyed by sport. */
  sessionsBySport?: Partial<Record<Sport, number>>;
}

export interface AwardedAchievement {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
}

/**
 * Default rule set. Kept declarative so the DB-backed layer can mirror or extend
 * it. All thresholds are strict-or-equal "reached" checks.
 */
export const DEFAULT_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_session',
    title: 'First Steps',
    description: 'Complete your first session.',
    category: 'milestone',
    predicate: (s) => s.totalSessions >= 1,
  },
  {
    id: 'ten_sessions',
    title: 'Getting Serious',
    description: 'Complete 10 sessions.',
    category: 'milestone',
    predicate: (s) => s.totalSessions >= 10,
  },
  {
    id: 'fifty_sessions',
    title: 'Dedicated',
    description: 'Complete 50 sessions.',
    category: 'milestone',
    predicate: (s) => s.totalSessions >= 50,
  },
  {
    id: 'hundred_throws',
    title: 'Century',
    description: 'Record 100 tracked throws.',
    category: 'milestone',
    predicate: (s) => s.totalThrows >= 100,
  },
  {
    id: 'new_personal_best',
    title: 'Record Breaker',
    description: 'Set a new personal best.',
    category: 'personal_best',
    predicate: (s) => s.setPersonalBest,
  },
  {
    id: 'streak_7',
    title: 'On a Roll',
    description: 'Reach a 7-window training streak.',
    category: 'consistency',
    predicate: (s) => s.currentStreak >= 7,
  },
  {
    id: 'streak_30',
    title: 'Unstoppable',
    description: 'Reach a 30-window training streak.',
    category: 'consistency',
    predicate: (s) => s.currentStreak >= 30,
  },
  {
    id: 'form_master',
    title: 'Textbook Form',
    description: 'Score 90 or higher on form in a single session.',
    category: 'performance',
    predicate: (s) => s.session.formScore >= 90,
  },
  {
    id: 'speed_demon',
    title: 'Speed Demon',
    description: 'Hit 100 km/h peak speed in a single session.',
    category: 'performance',
    predicate: (s) => s.session.peakSpeedKmh >= 100,
  },
];

function toAwarded(def: AchievementDef): AwardedAchievement {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    category: def.category,
  };
}

/**
 * Evaluate which achievements the snapshot satisfies, excluding any the user has
 * already earned (so callers get only *newly* unlocked badges).
 *
 * @param snapshot the stat snapshot to evaluate.
 * @param alreadyEarnedIds ids the user already holds (won't be re-awarded).
 * @param rules rule set to evaluate (defaults to DEFAULT_ACHIEVEMENTS).
 */
export function evaluateAchievements(
  snapshot: AchievementSnapshot,
  alreadyEarnedIds: string[] = [],
  rules: AchievementDef[] = DEFAULT_ACHIEVEMENTS,
): AwardedAchievement[] {
  const earned = new Set(alreadyEarnedIds);
  const newly: AwardedAchievement[] = [];

  for (const rule of rules) {
    if (earned.has(rule.id)) continue;
    if (rule.predicate(snapshot)) {
      newly.push(toAwarded(rule));
    }
  }

  return newly;
}
