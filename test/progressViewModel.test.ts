// test/progressViewModel.test.ts
// Deterministic tests for the Progress dashboard view-model use case.

import { describe, it, expect } from 'vitest';
import {
  makeProgressViewModel,
  projectProgress,
  ProgressViewModel,
} from '@/application/progressViewModel';
import type { SessionState, SessionSummary, Sport } from '@/domain';
import type { SessionRepository, SaveSessionMedia } from '@/ports';

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'sess-1',
    userId: 'u1',
    sport: 'tennis',
    createdAt: '2026-06-01T00:00:00.000Z',
    durationSecs: 60,
    peakSpeedKmh: 100,
    avgSpeedKmh: 80,
    formScore: 75,
    throwCount: 5,
    ...overrides,
  };
}

/** Simple in-memory fake of the SessionRepository port. */
function fakeRepo(all: SessionSummary[]): SessionRepository {
  return {
    async save(_session: SessionState, _media?: SaveSessionMedia) {
      return { id: 'saved' };
    },
    async getRecent(sport?: Sport, limit?: number): Promise<SessionSummary[]> {
      const filtered = sport ? all.filter((s) => s.sport === sport) : all;
      return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
    },
    async getById(id: string): Promise<SessionSummary | null> {
      return all.find((s) => s.id === id) ?? null;
    },
  };
}

describe('makeProgressViewModel — empty history', () => {
  it('returns a zeroed view-model when there are no sessions', async () => {
    const vm: ProgressViewModel = await makeProgressViewModel({
      repo: fakeRepo([]),
    })();
    expect(vm.sessionCount).toBe(0);
    expect(vm.peakSpeedSeries).toEqual([]);
    expect(vm.formScoreSeries).toEqual([]);
    expect(vm.bestPeakSpeedKmh).toBe(0);
    expect(vm.avgFormScore).toBe(0);
    expect(vm.bySport).toEqual([]);
  });
});

describe('makeProgressViewModel — single session', () => {
  it('produces one point per series and trivial aggregates', async () => {
    const repo = fakeRepo([
      summary({ id: 'a', peakSpeedKmh: 120, formScore: 88 }),
    ]);
    const vm = await makeProgressViewModel({ repo })();
    expect(vm.sessionCount).toBe(1);
    expect(vm.peakSpeedSeries).toEqual([{ x: 0, y: 120 }]);
    expect(vm.formScoreSeries).toEqual([{ x: 0, y: 88 }]);
    expect(vm.bestPeakSpeedKmh).toBe(120);
    expect(vm.avgFormScore).toBe(88);
    expect(vm.bySport).toEqual([
      {
        sport: 'tennis',
        sessionCount: 1,
        bestPeakSpeedKmh: 120,
        avgFormScore: 88,
      },
    ]);
  });
});

describe('makeProgressViewModel — chronological sorting', () => {
  it('sorts oldest -> newest regardless of repo order', async () => {
    const repo = fakeRepo([
      summary({ id: 'mid', createdAt: '2026-06-02T00:00:00.000Z', peakSpeedKmh: 110 }),
      summary({ id: 'new', createdAt: '2026-06-03T00:00:00.000Z', peakSpeedKmh: 130 }),
      summary({ id: 'old', createdAt: '2026-06-01T00:00:00.000Z', peakSpeedKmh: 90 }),
    ]);
    const vm = await makeProgressViewModel({ repo })();
    // y values follow chronological order: old(90), mid(110), new(130)
    expect(vm.peakSpeedSeries).toEqual([
      { x: 0, y: 90 },
      { x: 1, y: 110 },
      { x: 2, y: 130 },
    ]);
  });
});

describe('makeProgressViewModel — sport filter', () => {
  it('passes the sport filter through to the repository', async () => {
    const repo = fakeRepo([
      summary({ id: 't1', sport: 'tennis', formScore: 70 }),
      summary({ id: 'g1', sport: 'golf', formScore: 40 }),
      summary({ id: 't2', sport: 'tennis', formScore: 90 }),
    ]);
    const vm = await makeProgressViewModel({ repo })({ sport: 'tennis' });
    expect(vm.sessionCount).toBe(2);
    expect(vm.bySport).toHaveLength(1);
    expect(vm.bySport[0].sport).toBe('tennis');
    expect(vm.avgFormScore).toBe(80);
  });

  it('respects the limit argument', async () => {
    const repo = fakeRepo([
      summary({ id: '1', createdAt: '2026-06-01T00:00:00.000Z' }),
      summary({ id: '2', createdAt: '2026-06-02T00:00:00.000Z' }),
      summary({ id: '3', createdAt: '2026-06-03T00:00:00.000Z' }),
    ]);
    const vm = await makeProgressViewModel({ repo })({ limit: 2 });
    expect(vm.sessionCount).toBe(2);
  });
});

describe('projectProgress — aggregate correctness', () => {
  it('computes best peak speed, average form, and per-sport breakdown', () => {
    const vm = projectProgress([
      summary({ id: 'a', sport: 'tennis', peakSpeedKmh: 100, formScore: 60 }),
      summary({ id: 'b', sport: 'tennis', peakSpeedKmh: 140, formScore: 80 }),
      summary({ id: 'c', sport: 'golf', peakSpeedKmh: 50, formScore: 90 }),
    ]);
    expect(vm.sessionCount).toBe(3);
    expect(vm.bestPeakSpeedKmh).toBe(140);
    // (60 + 80 + 90) / 3
    expect(vm.avgFormScore).toBeCloseTo(76.6667, 3);

    // tennis has 2 sessions (sorted first), golf 1
    expect(vm.bySport.map((b) => b.sport)).toEqual(['tennis', 'golf']);
    const tennis = vm.bySport.find((b) => b.sport === 'tennis')!;
    expect(tennis.sessionCount).toBe(2);
    expect(tennis.bestPeakSpeedKmh).toBe(140);
    expect(tennis.avgFormScore).toBe(70);
    const golf = vm.bySport.find((b) => b.sport === 'golf')!;
    expect(golf.bestPeakSpeedKmh).toBe(50);
    expect(golf.avgFormScore).toBe(90);
  });

  it('breaks per-sport ties on count by sport name', () => {
    const vm = projectProgress([
      summary({ id: 'g', sport: 'golf' }),
      summary({ id: 't', sport: 'tennis' }),
    ]);
    // equal counts -> alphabetical: golf before tennis
    expect(vm.bySport.map((b) => b.sport)).toEqual(['golf', 'tennis']);
  });

  it('does not mutate the input array', () => {
    const input = [
      summary({ id: 'b', createdAt: '2026-06-02T00:00:00.000Z' }),
      summary({ id: 'a', createdAt: '2026-06-01T00:00:00.000Z' }),
    ];
    const snapshot = JSON.stringify(input);
    projectProgress(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
