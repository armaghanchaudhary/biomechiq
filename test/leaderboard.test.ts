// test/leaderboard.test.ts
// Deterministic tests for the segmented leaderboard ranking logic.

import { describe, it, expect } from 'vitest';
import {
  buildLeaderboards,
  rankArena,
  findUserArena,
  LeaderboardEntry,
  SegmentKey,
} from '@/domain/services/leaderboard';

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    userId: 'u1',
    displayName: 'Athlete',
    sport: 'tennis',
    metric: 'peakSpeedKmh',
    value: 100,
    skillLevel: 'beginner',
    regionBucket: 'na',
    ageBucket: 'u16',
    period: 'all_time',
    periodKey: 'all_time',
    achievedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const SEGMENT: SegmentKey = {
  sport: 'tennis',
  metric: 'peakSpeedKmh',
  skillLevel: 'beginner',
  regionBucket: 'na',
  ageBucket: 'u16',
  period: 'all_time',
  periodKey: 'all_time',
};

describe('rankArena', () => {
  it('ranks higher-is-better metrics in descending order', () => {
    const board = rankArena(SEGMENT, [
      entry({ userId: 'a', value: 90 }),
      entry({ userId: 'b', value: 120 }),
      entry({ userId: 'c', value: 105 }),
    ]);
    expect(board.entries.map((e) => e.userId)).toEqual(['b', 'c', 'a']);
    expect(board.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(board.totalCompetitors).toBe(3);
  });

  it('uses 1224 competition ranking for ties', () => {
    const board = rankArena(SEGMENT, [
      entry({ userId: 'a', value: 120 }),
      entry({ userId: 'b', value: 120 }),
      entry({ userId: 'c', value: 110 }),
      entry({ userId: 'd', value: 110 }),
      entry({ userId: 'e', value: 100 }),
    ]);
    // Two tied at 120 -> rank 1,1 ; next two tied at 110 -> rank 3,3 ; then 5.
    expect(board.entries.map((e) => e.rank)).toEqual([1, 1, 3, 3, 5]);
  });

  it('breaks ties deterministically by achievedAt then userId', () => {
    const board = rankArena(SEGMENT, [
      entry({ userId: 'z', value: 120, achievedAt: '2026-06-05T00:00:00.000Z' }),
      entry({ userId: 'a', value: 120, achievedAt: '2026-06-02T00:00:00.000Z' }),
      entry({ userId: 'm', value: 120, achievedAt: '2026-06-02T00:00:00.000Z' }),
    ]);
    // Same value: earlier achievedAt first, then userId lexicographic.
    expect(board.entries.map((e) => e.userId)).toEqual(['a', 'm', 'z']);
    // ...but they all share rank 1 (tie membership is value-only).
    expect(board.entries.map((e) => e.rank)).toEqual([1, 1, 1]);
  });

  it('locates the current user rank', () => {
    const board = rankArena(
      SEGMENT,
      [
        entry({ userId: 'a', value: 130 }),
        entry({ userId: 'me', value: 110 }),
        entry({ userId: 'c', value: 120 }),
      ],
      'me',
    );
    expect(board.currentUserRank).toBe(3);
    expect(board.currentUserEntry?.userId).toBe('me');
    expect(board.currentUserEntry?.isCurrentUser).toBe(true);
    expect(board.entries.filter((e) => e.isCurrentUser)).toHaveLength(1);
  });

  it('truncates to top-N while preserving full rank info', () => {
    const board = rankArena(
      SEGMENT,
      [
        entry({ userId: 'a', value: 130 }),
        entry({ userId: 'b', value: 120 }),
        entry({ userId: 'me', value: 90 }),
      ],
      'me',
      2,
    );
    expect(board.entries).toHaveLength(2);
    expect(board.totalCompetitors).toBe(3);
    // current user is outside top-2 but rank still reported.
    expect(board.currentUserRank).toBe(3);
  });
});

describe('buildLeaderboards segmentation', () => {
  it('partitions entries into separate arenas by full segment', () => {
    const boards = buildLeaderboards([
      entry({ userId: 'a', sport: 'tennis', value: 100 }),
      entry({ userId: 'b', sport: 'tennis', value: 110 }),
      entry({ userId: 'c', sport: 'golf', value: 50 }),
    ]);
    expect(boards).toHaveLength(2);
    const tennis = boards.find((b) => b.segment.sport === 'tennis')!;
    const golf = boards.find((b) => b.segment.sport === 'golf')!;
    expect(tennis.totalCompetitors).toBe(2);
    expect(golf.totalCompetitors).toBe(1);
  });

  it('separates arenas by skill level and region and age', () => {
    const boards = buildLeaderboards([
      entry({ userId: 'a', skillLevel: 'beginner', regionBucket: 'na' }),
      entry({ userId: 'b', skillLevel: 'pro', regionBucket: 'na' }),
      entry({ userId: 'c', skillLevel: 'beginner', regionBucket: 'eu' }),
      entry({ userId: 'd', skillLevel: 'beginner', regionBucket: 'na', ageBucket: '18-29' }),
    ]);
    // 4 distinct (skill x region x age) combos -> 4 arenas.
    expect(boards).toHaveLength(4);
    expect(boards.every((b) => b.totalCompetitors === 1)).toBe(true);
  });

  it('collapses dimensions when disabled (merge regions into one arena)', () => {
    const boards = buildLeaderboards(
      [
        entry({ userId: 'a', regionBucket: 'na', value: 100 }),
        entry({ userId: 'b', regionBucket: 'eu', value: 120 }),
      ],
      { dimensions: { regionBucket: false } },
    );
    expect(boards).toHaveLength(1);
    expect(boards[0].totalCompetitors).toBe(2);
    expect(boards[0].entries.map((e) => e.userId)).toEqual(['b', 'a']);
  });

  it('drops non-finite values', () => {
    const boards = buildLeaderboards([
      entry({ userId: 'a', value: 100 }),
      entry({ userId: 'b', value: Number.NaN }),
      entry({ userId: 'c', value: Infinity }),
    ]);
    expect(boards).toHaveLength(1);
    expect(boards[0].totalCompetitors).toBe(1);
    expect(boards[0].entries[0].userId).toBe('a');
  });

  it('produces deterministic arena ordering', () => {
    const input = [
      entry({ userId: 'a', sport: 'golf' }),
      entry({ userId: 'b', sport: 'tennis' }),
      entry({ userId: 'c', sport: 'baseball' }),
    ];
    const first = buildLeaderboards(input).map((b) => b.segment.sport);
    const second = buildLeaderboards([...input].reverse()).map(
      (b) => b.segment.sport,
    );
    expect(first).toEqual(second);
  });

  it('does not mutate the input array', () => {
    const input = [
      entry({ userId: 'a', value: 90 }),
      entry({ userId: 'b', value: 120 }),
    ];
    const snapshot = JSON.stringify(input);
    buildLeaderboards(input, { currentUserId: 'a' });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('findUserArena', () => {
  it('returns only the arena the user competes in, ranked', () => {
    const arena = findUserArena(
      [
        entry({ userId: 'me', regionBucket: 'na', value: 100 }),
        entry({ userId: 'rival', regionBucket: 'na', value: 120 }),
        entry({ userId: 'other', regionBucket: 'eu', value: 200 }),
      ],
      'me',
    );
    expect(arena).not.toBeNull();
    expect(arena!.segment.regionBucket).toBe('na');
    expect(arena!.totalCompetitors).toBe(2);
    expect(arena!.currentUserRank).toBe(2);
  });

  it('returns null when the user has no entry', () => {
    const arena = findUserArena([entry({ userId: 'someone' })], 'ghost');
    expect(arena).toBeNull();
  });
});
