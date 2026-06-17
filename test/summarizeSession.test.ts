// test/summarizeSession.test.ts
// Deterministic tests for the SummarizeSession use case. Verifies it correctly
// COMPOSES the domain engagement services into one post-session summary.

import { describe, it, expect } from 'vitest';
import {
  makeSummarizeSession,
  type SummarizeSessionInput,
  sessionStateToSummary,
} from '@/application/summarizeSession';
import { SessionState, SessionSummary } from '@/domain/types';
import { PersonalBest } from '@/domain/services/personalBests';
import { Goal } from '@/domain/services/goals';
import { Rep } from '@/domain/services/repDetector';

const MS_PER_DAY = 86_400_000;
const day = (n: number) => n * MS_PER_DAY; // epoch-day index -> ms

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 's1',
    userId: 'u1',
    sport: 'tennis',
    createdAt: '2026-06-17T10:00:00.000Z',
    durationSecs: 120,
    peakSpeedKmh: 80,
    avgSpeedKmh: 40,
    formScore: 75,
    throwCount: 10,
    ...overrides,
  };
}

function input(overrides: Partial<SummarizeSessionInput> = {}): SummarizeSessionInput {
  return {
    session: session(),
    priorBests: [],
    activeGoals: [],
    priorSessionTimestampsMs: [],
    unlockedAchievementIds: [],
    totalSessions: 1,
    totalThrows: 10,
    now: '2026-06-17T12:00:00.000Z',
    nowMs: Date.parse('2026-06-17T12:00:00.000Z'),
    ...overrides,
  };
}

function rep(index: number, peakSpeedKmh: number): Rep {
  return {
    index,
    startMs: index * 1000,
    peakMs: index * 1000 + 200,
    endMs: index * 1000 + 400,
    peakSpeedKmh,
    startIndex: index * 3,
    peakIndex: index * 3 + 1,
    endIndex: index * 3 + 2,
  };
}

describe('makeSummarizeSession', () => {
  // ── empty / first-session case ──────────────────────
  it('handles the empty first-session case', () => {
    const summarize = makeSummarizeSession();
    const result = summarize(input());

    // First session sets every tracked PB metric.
    expect(result.personalBests.newRecord).toBe(true);
    expect(result.personalBests.broken.length).toBeGreaterThan(0);
    expect(result.personalBests.broken.every((b) => b.previousValue === null)).toBe(true);

    // No goals defined -> no progress, none completed.
    expect(result.goals).toHaveLength(0);
    expect(result.completedGoals).toHaveLength(0);

    // First session -> streak of 1.
    expect(result.streak.current).toBe(1);
    expect(result.streak.longest).toBe(1);

    // First-session milestone + record-breaker unlocked.
    const ids = result.newAchievements.map((a) => a.id);
    expect(ids).toContain('first_session');
    expect(ids).toContain('new_personal_best');

    // No reps supplied -> no highlight.
    expect(result.bestRep).toBeNull();

    // Echoes the session through.
    expect(result.session.id).toBe('s1');
  });

  // ── new PB beating the old ──────────────────────────
  it('reports a new personal best that beats the prior record', () => {
    const summarize = makeSummarizeSession();
    const priorBests: PersonalBest[] = [
      { sport: 'tennis', metric: 'peakSpeedKmh', value: 80, sessionId: 's0', achievedAt: 'x' },
      { sport: 'tennis', metric: 'avgSpeedKmh', value: 40, sessionId: 's0', achievedAt: 'x' },
      { sport: 'tennis', metric: 'formScore', value: 75, sessionId: 's0', achievedAt: 'x' },
      { sport: 'tennis', metric: 'throwCount', value: 10, sessionId: 's0', achievedAt: 'x' },
    ];
    const result = summarize(
      input({
        session: session({ id: 's2', peakSpeedKmh: 95, avgSpeedKmh: 40, formScore: 75, throwCount: 10 }),
        priorBests,
      }),
    );

    expect(result.personalBests.newRecord).toBe(true);
    expect(result.personalBests.broken).toHaveLength(1);
    expect(result.personalBests.broken[0]).toMatchObject({
      metric: 'peakSpeedKmh',
      previousValue: 80,
      newValue: 95,
      improvement: 15,
    });
    // Record-breaker achievement follows from the PB.
    expect(result.newAchievements.map((a) => a.id)).toContain('new_personal_best');
  });

  it('reports no new PB when nothing improves', () => {
    const summarize = makeSummarizeSession();
    const priorBests: PersonalBest[] = [
      { sport: 'tennis', metric: 'peakSpeedKmh', value: 120, sessionId: 's0', achievedAt: 'x' },
      { sport: 'tennis', metric: 'avgSpeedKmh', value: 60, sessionId: 's0', achievedAt: 'x' },
      { sport: 'tennis', metric: 'formScore', value: 99, sessionId: 's0', achievedAt: 'x' },
      { sport: 'tennis', metric: 'throwCount', value: 50, sessionId: 's0', achievedAt: 'x' },
    ];
    const result = summarize(input({ priorBests, unlockedAchievementIds: ['first_session'] }));
    expect(result.personalBests.newRecord).toBe(false);
    expect(result.personalBests.broken).toHaveLength(0);
    expect(result.newAchievements.map((a) => a.id)).not.toContain('new_personal_best');
  });

  // ── a goal being completed ──────────────────────────
  it('marks a goal as completed when this session hits the target', () => {
    const summarize = makeSummarizeSession();
    const goal: Goal = {
      id: 'g1',
      sport: 'tennis',
      metric: 'peakSpeedKmh',
      target: 90,
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    const result = summarize(
      input({
        session: session({ peakSpeedKmh: 95 }),
        activeGoals: [goal],
      }),
    );

    expect(result.goals).toHaveLength(1);
    expect(result.goals[0].status).toBe('achieved');
    expect(result.completedGoals).toHaveLength(1);
    expect(result.completedGoals[0].goalId).toBe('g1');
  });

  it('leaves an unmet goal active and out of completedGoals', () => {
    const summarize = makeSummarizeSession();
    const goal: Goal = {
      id: 'g1',
      sport: 'tennis',
      metric: 'peakSpeedKmh',
      target: 200,
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    const result = summarize(input({ session: session({ peakSpeedKmh: 80 }), activeGoals: [goal] }));
    expect(result.goals[0].status).toBe('active');
    expect(result.goals[0].percent).toBe(40);
    expect(result.completedGoals).toHaveLength(0);
  });

  // ── streak continuing vs breaking ───────────────────
  it('continues a streak when this session extends the prior run', () => {
    const summarize = makeSummarizeSession();
    const result = summarize(
      input({
        // prior sessions on day 98 and 99; this session on day 100.
        priorSessionTimestampsMs: [day(98), day(99)],
        session: session({ createdAt: new Date(day(100)).toISOString() }),
        nowMs: day(100) + 3_600_000,
        now: new Date(day(100) + 3_600_000).toISOString(),
      }),
    );
    expect(result.streak.current).toBe(3);
    expect(result.streak.longest).toBe(3);
    expect(result.streak.activeToday).toBe(true);
  });

  it('breaks the current streak when there is a gap before this session', () => {
    const summarize = makeSummarizeSession();
    const result = summarize(
      input({
        // prior run on days 90-92, then a long gap to this session on day 100.
        priorSessionTimestampsMs: [day(90), day(91), day(92)],
        session: session({ createdAt: new Date(day(100)).toISOString() }),
        nowMs: day(100) + 3_600_000,
        now: new Date(day(100) + 3_600_000).toISOString(),
      }),
    );
    // The new session restarts the run; longest preserves the old 3.
    expect(result.streak.current).toBe(1);
    expect(result.streak.longest).toBe(3);
  });

  it('feeds streak length into consistency achievements', () => {
    const summarize = makeSummarizeSession();
    // Seven consecutive daily windows ending with this session.
    const prior = [day(94), day(95), day(96), day(97), day(98), day(99)];
    const result = summarize(
      input({
        priorSessionTimestampsMs: prior,
        session: session({ createdAt: new Date(day(100)).toISOString() }),
        nowMs: day(100) + 3_600_000,
        now: new Date(day(100) + 3_600_000).toISOString(),
        unlockedAchievementIds: ['first_session'],
      }),
    );
    expect(result.streak.current).toBe(7);
    expect(result.newAchievements.map((a) => a.id)).toContain('streak_7');
  });

  // ── an achievement unlocking ────────────────────────
  it('unlocks performance achievements on a strong session and respects already-earned ids', () => {
    const summarize = makeSummarizeSession();
    const result = summarize(
      input({
        session: session({ formScore: 95, peakSpeedKmh: 110 }),
        // Mark first_session already earned so we only see the new unlocks.
        unlockedAchievementIds: ['first_session'],
      }),
    );
    const ids = result.newAchievements.map((a) => a.id);
    expect(ids).toContain('form_master');
    expect(ids).toContain('speed_demon');
    expect(ids).not.toContain('first_session');
  });

  // ── best rep selection ──────────────────────────────
  it('selects the highest-scoring rep as the highlight', () => {
    const summarize = makeSummarizeSession();
    const result = summarize(
      input({
        reps: [rep(0, 60), rep(1, 120), rep(2, 90)],
      }),
    );
    expect(result.bestRep).not.toBeNull();
    expect(result.bestRep?.rep.index).toBe(1);
    expect(result.bestRep?.peakSpeedKmh).toBe(120);
  });

  it('blends form scores into best-rep ranking via config', () => {
    // Two reps: rep 0 is faster, rep 1 has perfect form. With a heavy form
    // weight, the high-form rep should win.
    const summarize = makeSummarizeSession({ config: { bestRep: { speedWeight: 0.1 } } });
    const result = summarize(
      input({
        reps: [rep(0, 100), rep(1, 90)],
        repFormScores: [
          { index: 0, formScore: 10 },
          { index: 1, formScore: 100 },
        ],
      }),
    );
    expect(result.bestRep?.rep.index).toBe(1);
  });

  // ── config: weekly cadence ──────────────────────────
  it('honours a weekly streak cadence from deps config', () => {
    const summarize = makeSummarizeSession({ config: { streak: { cadence: 'weekly' } } });
    const result = summarize(
      input({
        priorSessionTimestampsMs: [day(0), day(7)],
        session: session({ createdAt: new Date(day(14)).toISOString() }),
        nowMs: day(14) + day(1),
        now: new Date(day(14) + day(1)).toISOString(),
      }),
    );
    expect(result.streak.current).toBe(3);
  });
});

// ── sessionStateToSummary helper ──────────────────────
describe('sessionStateToSummary', () => {
  it('maps a live SessionState onto the canonical SessionSummary shape', () => {
    const state: SessionState = {
      id: 'live-1',
      status: 'complete',
      sport: 'golf',
      startedAt: 1000,
      duration: 240,
      peakSpeed: 130,
      avgSpeed: 55,
      throwCount: 22,
      formScore: 88,
      speedSamples: [],
      landmarks: null,
    };
    const summary = sessionStateToSummary(state, 'user-9', '2026-06-17T10:00:00.000Z');
    expect(summary).toEqual({
      id: 'live-1',
      userId: 'user-9',
      sport: 'golf',
      createdAt: '2026-06-17T10:00:00.000Z',
      durationSecs: 240,
      peakSpeedKmh: 130,
      avgSpeedKmh: 55,
      formScore: 88,
      throwCount: 22,
    });
  });

  it('flows through the use case end-to-end from a SessionState', () => {
    const summarize = makeSummarizeSession();
    const state: SessionState = {
      id: 'live-2',
      status: 'complete',
      sport: 'tennis',
      startedAt: 1000,
      duration: 100,
      peakSpeed: 105,
      avgSpeed: 50,
      throwCount: 12,
      formScore: 70,
      speedSamples: [],
      landmarks: null,
    };
    const summary = sessionStateToSummary(state, 'u1', '2026-06-17T10:00:00.000Z');
    const result = summarize(input({ session: summary, unlockedAchievementIds: ['first_session'] }));
    expect(result.personalBests.newRecord).toBe(true);
    expect(result.newAchievements.map((a) => a.id)).toContain('speed_demon');
  });
});
