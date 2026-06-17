// src/application/progressViewModel.ts
// Use case: ProgressViewModel. Turns recent SessionSummary[] into chart-ready
// data for the Progress dashboard. Math is pure and lives here (application layer).

import type { SessionSummary, Sport } from '@/domain';
import type { SessionRepository } from '@/ports';
import type { SeriesPoint } from '@/ports';

export interface SportBreakdown {
  sport: Sport;
  sessionCount: number;
  bestPeakSpeedKmh: number;
  avgFormScore: number;
}

export interface ProgressViewModel {
  /** Sessions used to build this view-model, sorted oldest -> newest. */
  sessionCount: number;
  /** Peak object speed (km/h) over time, chronological. */
  peakSpeedSeries: SeriesPoint[];
  /** Form score (0-100) over time, chronological. */
  formScoreSeries: SeriesPoint[];
  /** Best peak speed (km/h) across all included sessions. 0 when empty. */
  bestPeakSpeedKmh: number;
  /** Mean form score across all included sessions. 0 when empty. */
  avgFormScore: number;
  /** Per-sport aggregate breakdown, sorted by sessionCount desc then sport. */
  bySport: SportBreakdown[];
}

export interface ProgressQuery {
  sport?: Sport;
  limit?: number;
}

function emptyViewModel(): ProgressViewModel {
  return {
    sessionCount: 0,
    peakSpeedSeries: [],
    formScoreSeries: [],
    bestPeakSpeedKmh: 0,
    avgFormScore: 0,
    bySport: [],
  };
}

function buildBreakdown(sessions: SessionSummary[]): SportBreakdown[] {
  const groups = new Map<Sport, SessionSummary[]>();
  for (const s of sessions) {
    const bucket = groups.get(s.sport);
    if (bucket) bucket.push(s);
    else groups.set(s.sport, [s]);
  }

  const breakdown: SportBreakdown[] = [];
  for (const [sport, group] of groups) {
    const bestPeakSpeedKmh = group.reduce(
      (max, s) => (s.peakSpeedKmh > max ? s.peakSpeedKmh : max),
      0,
    );
    const avgFormScore =
      group.reduce((sum, s) => sum + s.formScore, 0) / group.length;
    breakdown.push({
      sport,
      sessionCount: group.length,
      bestPeakSpeedKmh,
      avgFormScore,
    });
  }

  breakdown.sort((a, b) =>
    b.sessionCount !== a.sessionCount
      ? b.sessionCount - a.sessionCount
      : a.sport.localeCompare(b.sport),
  );

  return breakdown;
}

/** Pure projection from a session list to the dashboard view-model. */
export function projectProgress(sessions: SessionSummary[]): ProgressViewModel {
  if (sessions.length === 0) return emptyViewModel();

  // Oldest -> newest so charts read left-to-right in time order.
  const sorted = [...sessions].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );

  const peakSpeedSeries: SeriesPoint[] = [];
  const formScoreSeries: SeriesPoint[] = [];
  let bestPeakSpeedKmh = 0;
  let formScoreSum = 0;

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    peakSpeedSeries.push({ x: i, y: s.peakSpeedKmh });
    formScoreSeries.push({ x: i, y: s.formScore });
    if (s.peakSpeedKmh > bestPeakSpeedKmh) bestPeakSpeedKmh = s.peakSpeedKmh;
    formScoreSum += s.formScore;
  }

  return {
    sessionCount: sorted.length,
    peakSpeedSeries,
    formScoreSeries,
    bestPeakSpeedKmh,
    avgFormScore: formScoreSum / sorted.length,
    bySport: buildBreakdown(sorted),
  };
}

export interface ProgressViewModelDeps {
  repo: SessionRepository;
}

export function makeProgressViewModel(deps: ProgressViewModelDeps) {
  return async (query: ProgressQuery = {}): Promise<ProgressViewModel> => {
    const sessions = await deps.repo.getRecent(query.sport, query.limit);
    return projectProgress(sessions ?? []);
  };
}
