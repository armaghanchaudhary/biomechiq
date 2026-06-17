// src/domain/services/leaderboard.ts
// Pure ranking + segmentation for competitive leaderboards.
//
// Philosophy: never a single global table. An athlete competes inside an
// "arena" — a coarse segment (sport × metric × skill level × region × age ×
// period) — so the board stays achievable and motivating. This module turns a
// flat list of in-memory entries into ranked, per-arena leaderboards and locates
// the current user's rank. It mirrors the SQL in docs/SUPABASE_SCHEMA_ENGAGEMENT.sql.
//
// PURE domain service: no React, no Expo, no vendor SDK, no Date.now(), no DB.

import { Sport } from '../types';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'pro';
export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';

/** A single athlete's best value within one fully-qualified segment. */
export interface LeaderboardEntry {
  userId: string;
  displayName?: string;
  sport: Sport;
  metric: string;
  value: number;
  skillLevel: SkillLevel;
  regionBucket: string; // e.g. 'na' | 'eu' | 'apac' | 'global'
  ageBucket: string;    // e.g. 'u16' | '18-29' | 'all'
  period: LeaderboardPeriod;
  periodKey: string;    // e.g. '2026-W24' | '2026-06' | 'all_time'
  achievedAt?: string;  // ISO timestamp, used only as a deterministic tiebreaker
}

/** The dimensions that define which arena an entry belongs to. */
export interface SegmentKey {
  sport: Sport;
  metric: string;
  skillLevel: SkillLevel;
  regionBucket: string;
  ageBucket: string;
  period: LeaderboardPeriod;
  periodKey: string;
}

/** One ranked competitor inside an arena. */
export interface RankedEntry extends LeaderboardEntry {
  /** 1-based competition rank ("1224" style: ties share a rank, next rank skips). */
  rank: number;
  /** True for the current user, when one was supplied. */
  isCurrentUser: boolean;
}

/** A fully ranked arena. */
export interface Leaderboard {
  segment: SegmentKey;
  entries: RankedEntry[];
  totalCompetitors: number;
  /** The current user's rank within this arena, or null when absent. */
  currentUserRank: number | null;
  /** The current user's ranked row, or null when absent. */
  currentUserEntry: RankedEntry | null;
}

/** Which dimensions to group by when partitioning entries into arenas. */
export interface SegmentDimensions {
  sport?: boolean;
  metric?: boolean;
  skillLevel?: boolean;
  regionBucket?: boolean;
  ageBucket?: boolean;
  period?: boolean;
  periodKey?: boolean;
}

// Higher-is-better is the default for every tracked metric (speed, form score,
// throw count, reps). Lower-is-better metrics can be added here later.
const LOWER_IS_BETTER = new Set<string>([]);

function isHigherBetter(metric: string): boolean {
  return !LOWER_IS_BETTER.has(metric);
}

function segmentKeyOf(entry: LeaderboardEntry): SegmentKey {
  return {
    sport: entry.sport,
    metric: entry.metric,
    skillLevel: entry.skillLevel,
    regionBucket: entry.regionBucket,
    ageBucket: entry.ageBucket,
    period: entry.period,
    periodKey: entry.periodKey,
  };
}

/**
 * Build the grouping signature for an entry given which dimensions are active.
 * Inactive dimensions collapse together (e.g. ignoring region merges all regions
 * into one arena). The signature is a delimiter-joined string of the active
 * dimension values.
 */
function groupSignature(
  entry: LeaderboardEntry,
  dims: Required<SegmentDimensions>,
): string {
  const parts: string[] = [];
  if (dims.sport) parts.push(`sport=${entry.sport}`);
  if (dims.metric) parts.push(`metric=${entry.metric}`);
  if (dims.skillLevel) parts.push(`skill=${entry.skillLevel}`);
  if (dims.regionBucket) parts.push(`region=${entry.regionBucket}`);
  if (dims.ageBucket) parts.push(`age=${entry.ageBucket}`);
  if (dims.period) parts.push(`period=${entry.period}`);
  if (dims.periodKey) parts.push(`periodKey=${entry.periodKey}`);
  return parts.join('|');
}

const ALL_DIMENSIONS: Required<SegmentDimensions> = {
  sport: true,
  metric: true,
  skillLevel: true,
  regionBucket: true,
  ageBucket: true,
  period: true,
  periodKey: true,
};

function resolveDimensions(
  dims?: SegmentDimensions,
): Required<SegmentDimensions> {
  if (!dims) return ALL_DIMENSIONS;
  return {
    sport: dims.sport ?? true,
    metric: dims.metric ?? true,
    skillLevel: dims.skillLevel ?? true,
    regionBucket: dims.regionBucket ?? true,
    ageBucket: dims.ageBucket ?? true,
    period: dims.period ?? true,
    periodKey: dims.periodKey ?? true,
  };
}

/**
 * Deterministic comparator. Primary: metric value (direction by metric).
 * Tiebreakers keep ordering stable across runs and platforms:
 *   1. earlier achievedAt wins (you got there first)
 *   2. userId lexicographic (final, fully deterministic)
 */
function makeComparator(metric: string) {
  const higherBetter = isHigherBetter(metric);
  return (a: LeaderboardEntry, b: LeaderboardEntry): number => {
    if (a.value !== b.value) {
      return higherBetter ? b.value - a.value : a.value - b.value;
    }
    const at = a.achievedAt ?? '';
    const bt = b.achievedAt ?? '';
    if (at !== bt) {
      // Empty timestamps sort last so dated entries get the earlier slot.
      if (at === '') return 1;
      if (bt === '') return -1;
      return at < bt ? -1 : 1;
    }
    if (a.userId !== b.userId) return a.userId < b.userId ? -1 : 1;
    return 0;
  };
}

/**
 * Assign 1-based competition ranks ("1224"): equal values share a rank and the
 * following rank skips by the size of the tie group. Tie membership is decided
 * by metric VALUE only — the comparator's secondary keys order tied rows for a
 * stable display but do not split the shared rank.
 */
function assignRanks(
  sorted: LeaderboardEntry[],
  metric: string,
  currentUserId: string | null,
): RankedEntry[] {
  const result: RankedEntry[] = [];
  let lastValue: number | null = null;
  let lastRank = 0;

  sorted.forEach((entry, index) => {
    let rank: number;
    if (lastValue !== null && entry.value === lastValue) {
      rank = lastRank; // tie: share the previous rank
    } else {
      rank = index + 1; // competition ranking: positional, skips after ties
      lastValue = entry.value;
      lastRank = rank;
    }
    result.push({
      ...entry,
      rank,
      isCurrentUser: currentUserId !== null && entry.userId === currentUserId,
    });
  });

  return result;
}

function rankOneArena(
  segment: SegmentKey,
  entries: LeaderboardEntry[],
  currentUserId: string | null,
): Leaderboard {
  const sorted = [...entries].sort(makeComparator(segment.metric));
  const ranked = assignRanks(sorted, segment.metric, currentUserId);

  const currentUserEntry =
    currentUserId !== null
      ? ranked.find((e) => e.userId === currentUserId) ?? null
      : null;

  return {
    segment,
    entries: ranked,
    totalCompetitors: ranked.length,
    currentUserRank: currentUserEntry ? currentUserEntry.rank : null,
    currentUserEntry,
  };
}

export interface BuildLeaderboardsOptions {
  /** Which dimensions define an arena. Defaults to all (finest segmentation). */
  dimensions?: SegmentDimensions;
  /** Highlight + locate this user across every arena. */
  currentUserId?: string | null;
  /** Cap each arena's returned rows (top-N). Omit for the full board. */
  limit?: number;
}

/**
 * Partition entries into arenas and rank each one independently.
 *
 * Non-finite values are dropped (they cannot be fairly ranked). The returned
 * leaderboards are sorted by a stable signature so output order is deterministic.
 * `limit` truncates each arena's `entries` to the top-N but `totalCompetitors`
 * and the current user's rank always reflect the full, untruncated arena.
 */
export function buildLeaderboards(
  entries: LeaderboardEntry[],
  options: BuildLeaderboardsOptions = {},
): Leaderboard[] {
  const dims = resolveDimensions(options.dimensions);
  const currentUserId = options.currentUserId ?? null;

  const groups = new Map<
    string,
    { segment: SegmentKey; items: LeaderboardEntry[] }
  >();

  for (const entry of entries) {
    if (!Number.isFinite(entry.value)) continue;
    const sig = groupSignature(entry, dims);
    let group = groups.get(sig);
    if (!group) {
      group = { segment: segmentKeyOf(entry), items: [] };
      groups.set(sig, group);
    }
    group.items.push(entry);
  }

  const boards: Array<{ sig: string; board: Leaderboard }> = [];
  for (const [sig, group] of groups) {
    const board = rankOneArena(group.segment, group.items, currentUserId);
    if (options.limit !== undefined && options.limit >= 0) {
      board.entries = board.entries.slice(0, options.limit);
    }
    boards.push({ sig, board });
  }

  boards.sort((a, b) => (a.sig < b.sig ? -1 : a.sig > b.sig ? 1 : 0));
  return boards.map((b) => b.board);
}

/**
 * Rank a single, already-filtered arena (every entry assumed to share the same
 * segment). Convenience wrapper over buildLeaderboards for the common case where
 * the caller has already scoped entries to one arena (e.g. from a SQL query).
 */
export function rankArena(
  segment: SegmentKey,
  entries: LeaderboardEntry[],
  currentUserId: string | null = null,
  limit?: number,
): Leaderboard {
  const board = rankOneArena(segment, entries, currentUserId);
  if (limit !== undefined && limit >= 0) {
    board.entries = board.entries.slice(0, limit);
  }
  return board;
}

/**
 * Find the arena the current user belongs to (their own segment) and return its
 * ranked leaderboard. This is the "show me my achievable arena" entry point.
 * Returns null when the user has no entry in the supplied set.
 */
export function findUserArena(
  entries: LeaderboardEntry[],
  currentUserId: string,
  options: Omit<BuildLeaderboardsOptions, 'currentUserId'> = {},
): Leaderboard | null {
  const mine = entries.find((e) => e.userId === currentUserId);
  if (!mine) return null;

  const dims = resolveDimensions(options.dimensions);
  const mySig = groupSignature(mine, dims);
  const sameArena = entries.filter((e) => groupSignature(e, dims) === mySig);

  const boards = buildLeaderboards(sameArena, {
    ...options,
    currentUserId,
  });
  return boards[0] ?? null;
}
