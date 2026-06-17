// test/engagement.test.ts
// Deterministic tests for the engagement layer (PBs, goals, streaks, achievements).

import { describe, it, expect } from 'vitest';
import { SessionSummary } from '@/domain/types';
import {
  updatePersonalBests,
  findPersonalBest,
  PersonalBest,
} from '@/domain/services/personalBests';
import { evaluateGoal, evaluateGoals, Goal } from '@/domain/services/goals';
import { computeStreak } from '@/domain/services/streaks';
import {
  evaluateAchievements,
  AchievementSnapshot,
  DEFAULT_ACHIEVEMENTS,
} from '@/domain/services/achievements';

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

const MS_PER_DAY = 86_400_000;
const day = (n: number) => n * MS_PER_DAY; // epoch-day index -> ms

// ── personalBests ─────────────────────────────────────

describe('personalBests', () => {
  it('sets all metrics as records on first session for a sport', () => {
    const result = updatePersonalBests([], session());
    expect(result.newRecord).toBe(true);
    expect(result.broken).toHaveLength(4);
    expect(result.broken.every((b) => b.previousValue === null)).toBe(true);
    expect(findPersonalBest(result.personalBests, 'tennis', 'peakSpeedKmh')?.value).toBe(80);
  });

  it('breaks only the metrics that strictly improve', () => {
    const prior: PersonalBest[] = [
      { sport: 'tennis', metric: 'peakSpeedKmh', value: 80, sessionId: 's0', achievedAt: 'x' },
      { sport: 'tennis', metric: 'avgSpeedKmh', value: 40, sessionId: 's0', achievedAt: 'x' },
      { sport: 'tennis', metric: 'formScore', value: 75, sessionId: 's0', achievedAt: 'x' },
      { sport: 'tennis', metric: 'throwCount', value: 10, sessionId: 's0', achievedAt: 'x' },
    ];
    const result = updatePersonalBests(
      prior,
      session({ id: 's2', peakSpeedKmh: 90, avgSpeedKmh: 40, formScore: 75, throwCount: 10 }),
    );
    expect(result.broken).toHaveLength(1);
    expect(result.broken[0]).toMatchObject({
      metric: 'peakSpeedKmh',
      previousValue: 80,
      newValue: 90,
      improvement: 10,
    });
    expect(findPersonalBest(result.personalBests, 'tennis', 'peakSpeedKmh')?.value).toBe(90);
    expect(findPersonalBest(result.personalBests, 'tennis', 'avgSpeedKmh')?.value).toBe(40);
  });

  it('does not mutate prior bests and keeps other sports intact', () => {
    const prior: PersonalBest[] = [
      { sport: 'golf', metric: 'formScore', value: 60, sessionId: 's0', achievedAt: 'x' },
    ];
    const snapshot = JSON.stringify(prior);
    const result = updatePersonalBests(prior, session({ sport: 'tennis' }));
    expect(JSON.stringify(prior)).toBe(snapshot); // unchanged
    expect(findPersonalBest(result.personalBests, 'golf', 'formScore')?.value).toBe(60);
  });

  it('ignores zero / negative noise', () => {
    const result = updatePersonalBests([], session({ peakSpeedKmh: 0, avgSpeedKmh: -5 }));
    expect(findPersonalBest(result.personalBests, 'tennis', 'peakSpeedKmh')).toBeNull();
    expect(findPersonalBest(result.personalBests, 'tennis', 'avgSpeedKmh')).toBeNull();
    expect(findPersonalBest(result.personalBests, 'tennis', 'formScore')?.value).toBe(75);
  });
});

// ── goals ─────────────────────────────────────────────

describe('goals', () => {
  const goal: Goal = {
    id: 'g1',
    sport: 'tennis',
    metric: 'peakSpeedKmh',
    target: 100,
    createdAt: '2026-06-01T00:00:00.000Z',
  };

  it('reports active progress when target not yet met', () => {
    const p = evaluateGoal(
      goal,
      [session({ createdAt: '2026-06-10T00:00:00.000Z', peakSpeedKmh: 80 })],
      '2026-06-17T00:00:00.000Z',
    );
    expect(p.status).toBe('active');
    expect(p.best).toBe(80);
    expect(p.remaining).toBe(20);
    expect(p.percent).toBe(80);
    expect(p.achievedAt).toBeNull();
  });

  it('marks achieved at the earliest qualifying session', () => {
    const p = evaluateGoal(
      goal,
      [
        session({ id: 'a', createdAt: '2026-06-10T00:00:00.000Z', peakSpeedKmh: 105 }),
        session({ id: 'b', createdAt: '2026-06-12T00:00:00.000Z', peakSpeedKmh: 110 }),
      ],
      '2026-06-17T00:00:00.000Z',
    );
    expect(p.status).toBe('achieved');
    expect(p.best).toBe(110);
    expect(p.remaining).toBe(0);
    expect(p.percent).toBe(100);
    expect(p.achievedAt).toBe('2026-06-10T00:00:00.000Z');
  });

  it('ignores sessions before the goal was created and of other sports', () => {
    const p = evaluateGoal(
      goal,
      [
        session({ createdAt: '2026-05-01T00:00:00.000Z', peakSpeedKmh: 120 }), // before
        session({ sport: 'golf', createdAt: '2026-06-10T00:00:00.000Z', peakSpeedKmh: 120 }), // other sport
      ],
      '2026-06-17T00:00:00.000Z',
    );
    expect(p.best).toBe(0);
    expect(p.status).toBe('active');
  });

  it('expires past-deadline unmet goals', () => {
    const withDeadline: Goal = { ...goal, deadline: '2026-06-15T00:00:00.000Z' };
    const p = evaluateGoal(
      withDeadline,
      [session({ createdAt: '2026-06-10T00:00:00.000Z', peakSpeedKmh: 50 })],
      '2026-06-17T00:00:00.000Z',
    );
    expect(p.status).toBe('expired');
  });

  it('evaluateGoals batches', () => {
    const results = evaluateGoals([goal], [session({ peakSpeedKmh: 100 })], '2026-06-17T00:00:00.000Z');
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('achieved');
  });
});

// ── streaks ───────────────────────────────────────────

describe('streaks', () => {
  it('returns empty result for no sessions', () => {
    const r = computeStreak([], { cadence: 'daily' }, day(100));
    expect(r).toMatchObject({ current: 0, longest: 0, lastActiveDay: null, activeToday: false });
  });

  it('counts a consecutive daily streak ending today', () => {
    const r = computeStreak(
      [day(98), day(99), day(100)],
      { cadence: 'daily' },
      day(100) + 3_600_000, // later same day
    );
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
    expect(r.extendedToday).toBe(true);
    expect(r.activeToday).toBe(true);
  });

  it('multiple sessions in one day count once', () => {
    const r = computeStreak(
      [day(100), day(100) + 1000, day(100) + 2000],
      { cadence: 'daily' },
      day(100),
    );
    expect(r.current).toBe(1);
    expect(r.longest).toBe(1);
  });

  it('breaks the current streak when now is past the window (but keeps longest)', () => {
    const r = computeStreak(
      [day(90), day(91), day(92)],
      { cadence: 'daily' },
      day(100), // long after
    );
    expect(r.current).toBe(0);
    expect(r.longest).toBe(3);
    expect(r.activeToday).toBe(false);
  });

  it('honours graceDays so a one-day gap does not break a daily streak', () => {
    const r = computeStreak(
      [day(98), day(100)], // gap of one day
      { cadence: 'daily', graceDays: 1 },
      day(100),
    );
    expect(r.current).toBe(2);
    expect(r.longest).toBe(2);
  });

  it('supports a weekly cadence (7-day windows)', () => {
    const r = computeStreak(
      [day(0), day(7), day(14)],
      { cadence: 'weekly' },
      day(14) + day(1),
    );
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
  });

  it('computes longest across a broken history', () => {
    const r = computeStreak(
      [day(1), day(2), day(3), day(10), day(11)],
      { cadence: 'daily' },
      day(11),
    );
    expect(r.longest).toBe(3);
    expect(r.current).toBe(2);
  });
});

// ── achievements ──────────────────────────────────────

describe('achievements', () => {
  function snap(overrides: Partial<AchievementSnapshot> = {}): AchievementSnapshot {
    return {
      session: session(),
      totalSessions: 1,
      totalThrows: 10,
      currentStreak: 0,
      setPersonalBest: false,
      ...overrides,
    };
  }

  it('awards first-session milestone', () => {
    const awarded = evaluateAchievements(snap());
    expect(awarded.map((a) => a.id)).toContain('first_session');
  });

  it('does not re-award already earned badges', () => {
    const awarded = evaluateAchievements(snap(), ['first_session']);
    expect(awarded.map((a) => a.id)).not.toContain('first_session');
  });

  it('awards performance and PB badges on a strong session', () => {
    const awarded = evaluateAchievements(
      snap({
        session: session({ formScore: 95, peakSpeedKmh: 110 }),
        setPersonalBest: true,
      }),
    );
    const ids = awarded.map((a) => a.id);
    expect(ids).toContain('form_master');
    expect(ids).toContain('speed_demon');
    expect(ids).toContain('new_personal_best');
  });

  it('awards consistency badges from streak length', () => {
    const ids = evaluateAchievements(snap({ currentStreak: 30 })).map((a) => a.id);
    expect(ids).toContain('streak_7');
    expect(ids).toContain('streak_30');
  });

  it('every default rule has a unique id', () => {
    const ids = DEFAULT_ACHIEVEMENTS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
