// src/domain/services/streaks.ts
// Cadence-matched streak calculation from a list of session timestamps.
// Not forced-daily: the cadence (daily / weekly / custom day-window) is
// configurable. PURE domain service: no React, no Expo, no Date.now().

export type StreakCadence = 'daily' | 'weekly' | 'custom';

export interface StreakConfig {
  cadence: StreakCadence;
  /**
   * Length of one cadence window in days. For 'daily' this is 1, for 'weekly'
   * 7. Defaults are applied per cadence; supply windowDays for 'custom'.
   */
  windowDays?: number;
  /**
   * Allowed grace beyond one window before the streak breaks, in days.
   * E.g. windowDays=1, graceDays=1 means a streak survives a one-day gap.
   * Defaults to 0 (a missed window breaks the streak).
   */
  graceDays?: number;
}

export interface StreakResult {
  current: number;          // length of the streak ending at the most recent active period
  longest: number;          // longest streak ever attained
  lastActiveDay: number | null; // day-index of the most recent session, or null
  extendedToday: boolean;   // does the most recent session fall in the current (now) window?
  activeToday: boolean;     // is the streak still "alive" as of now (within window+grace)?
}

const MS_PER_DAY = 86_400_000;

function resolveWindowDays(config: StreakConfig): number {
  if (config.windowDays && config.windowDays > 0) return config.windowDays;
  switch (config.cadence) {
    case 'weekly':
      return 7;
    case 'daily':
    case 'custom':
    default:
      return 1;
  }
}

/** Floor a millisecond timestamp to a whole-day index (UTC days since epoch). */
function toDayIndex(timestampMs: number): number {
  return Math.floor(timestampMs / MS_PER_DAY);
}

/**
 * Collapse a list of session timestamps to the sorted set of distinct cadence
 * "buckets" they fall into. A bucket is windowDays wide. Two sessions in the
 * same bucket count once.
 */
function toBuckets(timestampsMs: number[], windowDays: number): number[] {
  const buckets = new Set<number>();
  for (const ts of timestampsMs) {
    if (!Number.isFinite(ts)) continue;
    buckets.add(Math.floor(toDayIndex(ts) / windowDays));
  }
  return Array.from(buckets).sort((a, b) => a - b);
}

/**
 * Compute current / longest streak from session timestamps.
 *
 * A streak continues while consecutive activity buckets are at most one bucket
 * apart (plus any grace). The "current" streak is the run ending at the latest
 * bucket, but only counts as live if `now` is within that bucket (+ grace) — an
 * abandoned streak reports current=0 while still preserving longest.
 *
 * @param sessionTimestampsMs epoch-millisecond timestamps of completed sessions.
 * @param config cadence configuration.
 * @param nowMs caller-supplied current time in epoch ms.
 */
export function computeStreak(
  sessionTimestampsMs: number[],
  config: StreakConfig,
  nowMs: number,
): StreakResult {
  const windowDays = resolveWindowDays(config);
  const graceDays = Math.max(0, config.graceDays ?? 0);
  const graceBuckets = Math.floor(graceDays / windowDays);

  const buckets = toBuckets(sessionTimestampsMs, windowDays);

  if (buckets.length === 0) {
    return {
      current: 0,
      longest: 0,
      lastActiveDay: null,
      extendedToday: false,
      activeToday: false,
    };
  }

  // Two buckets are "consecutive" when their gap is within 1 + graceBuckets.
  const maxGap = 1 + graceBuckets;

  let longest = 1;
  let run = 1;
  // Track the run that ends at each bucket so we can read off the final run.
  let runEndingAtLast = 1;

  for (let i = 1; i < buckets.length; i++) {
    const gap = buckets[i] - buckets[i - 1];
    if (gap <= maxGap) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    runEndingAtLast = run;
  }

  const nowBucket = Math.floor(toDayIndex(nowMs) / windowDays);
  const lastBucket = buckets[buckets.length - 1];
  const gapToNow = nowBucket - lastBucket;

  const extendedToday = gapToNow === 0;
  // Streak is still alive if now is in the same bucket or within the allowed gap.
  const activeToday = gapToNow >= 0 && gapToNow <= maxGap;

  return {
    current: activeToday ? runEndingAtLast : 0,
    longest,
    lastActiveDay: toDayIndex(
      sessionTimestampsMs
        .filter((t) => Number.isFinite(t))
        .reduce((a, b) => Math.max(a, b)),
    ),
    extendedToday,
    activeToday,
  };
}
