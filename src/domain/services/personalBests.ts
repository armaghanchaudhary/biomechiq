// src/domain/services/personalBests.ts
// Personal-best tracking. Given prior PBs + a finished session, compute the
// updated PB set per sport+metric and report which records were broken.
// PURE domain service: no React, no Expo, no vendor SDK, no Date.now().

import { SessionSummary, Sport } from '../types';

/** Metrics for which a personal best can be tracked. */
export type PBMetric = 'peakSpeedKmh' | 'avgSpeedKmh' | 'formScore' | 'throwCount';

export interface PersonalBest {
  sport: Sport;
  metric: PBMetric;
  value: number;
  sessionId: string;
  achievedAt: string; // ISO timestamp (mirrors SessionSummary.createdAt)
}

export interface PersonalBestBreak {
  sport: Sport;
  metric: PBMetric;
  previousValue: number | null; // null => first record for this sport+metric
  newValue: number;
  improvement: number; // newValue - (previousValue ?? 0)
}

export interface PersonalBestsResult {
  /** The full, updated PB set (prior PBs with any beaten records replaced). */
  personalBests: PersonalBest[];
  /** Records broken by this session (empty when nothing improved). */
  broken: PersonalBestBreak[];
  /** Convenience flag: true when at least one PB was set. */
  newRecord: boolean;
}

// All metrics where "higher is better". Every PBMetric here is max-oriented.
const TRACKED_METRICS: PBMetric[] = [
  'peakSpeedKmh',
  'avgSpeedKmh',
  'formScore',
  'throwCount',
];

function metricValue(session: SessionSummary, metric: PBMetric): number {
  switch (metric) {
    case 'peakSpeedKmh':
      return session.peakSpeedKmh;
    case 'avgSpeedKmh':
      return session.avgSpeedKmh;
    case 'formScore':
      return session.formScore;
    case 'throwCount':
      return session.throwCount;
  }
}

function keyOf(sport: Sport, metric: PBMetric): string {
  return `${sport}::${metric}`;
}

/**
 * Update personal bests with a freshly completed session.
 *
 * A record is broken only on a strict improvement (value > existing). Ties keep
 * the earlier record so the achievedAt timestamp reflects the first attainment.
 * Returns a brand-new array — the input `priorBests` is never mutated.
 */
export function updatePersonalBests(
  priorBests: PersonalBest[],
  session: SessionSummary,
): PersonalBestsResult {
  const byKey = new Map<string, PersonalBest>();
  for (const pb of priorBests) {
    byKey.set(keyOf(pb.sport, pb.metric), pb);
  }

  const broken: PersonalBestBreak[] = [];

  for (const metric of TRACKED_METRICS) {
    const value = metricValue(session, metric);
    // Ignore non-finite / negative noise.
    if (!Number.isFinite(value) || value <= 0) continue;

    const key = keyOf(session.sport, metric);
    const existing = byKey.get(key);

    if (!existing || value > existing.value) {
      broken.push({
        sport: session.sport,
        metric,
        previousValue: existing ? existing.value : null,
        newValue: value,
        improvement: value - (existing ? existing.value : 0),
      });
      byKey.set(key, {
        sport: session.sport,
        metric,
        value,
        sessionId: session.id,
        achievedAt: session.createdAt,
      });
    }
  }

  return {
    personalBests: Array.from(byKey.values()),
    broken,
    newRecord: broken.length > 0,
  };
}

/** Look up a single personal best, or null when none has been set. */
export function findPersonalBest(
  bests: PersonalBest[],
  sport: Sport,
  metric: PBMetric,
): PersonalBest | null {
  return (
    bests.find((b) => b.sport === sport && b.metric === metric) ?? null
  );
}
