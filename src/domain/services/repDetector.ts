// src/domain/services/repDetector.ts
// Rep / swing / throw segmentation from a session timeseries.
// PURE domain service — no React, Expo, or vendor SDK imports.
//
// Generalizes the streaming ThrowDetector (see speedEngine.ts) into a batch
// segmenter that, given an ordered array of SpeedSamples (and optionally the
// matching Landmark frames), splits the session into discrete reps. A "rep" is
// one swing / throw / kick / shot cycle: speed rises above an onset threshold,
// peaks (release / contact / impact), then falls back below a release threshold.
//
// Thresholds are configurable per sport so a 60 km/h cricket delivery and a
// 12 km/h golf putt are both segmented sensibly.

import { Landmark, SpeedSample, Sport } from '../types';

// ── Public shapes ─────────────────────────────────────

/**
 * One detected rep within a session.
 * Times are absolute, in milliseconds, taken from the source SpeedSample
 * timestamps so callers can index back into their own timeseries.
 */
export interface Rep {
  index: number;        // 0-based position within the session
  startMs: number;      // timestamp where speed first crossed the onset threshold
  peakMs: number;       // timestamp of the peak speed (release / contact / impact)
  endMs: number;        // timestamp where speed fell back below the release threshold
  peakSpeedKmh: number; // peak speed observed within the rep
  startIndex: number;   // sample index of startMs (into the input array)
  peakIndex: number;    // sample index of peakMs
  endIndex: number;     // sample index of endMs
}

/**
 * Tunable segmentation parameters. All optional — sensible per-sport defaults
 * are supplied via {@link repConfigForSport}.
 */
export interface RepDetectorConfig {
  /** Speed (km/h) the timeseries must exceed to START a rep. */
  onsetSpeedKmh: number;
  /** Speed (km/h) the timeseries must fall below to END an active rep. */
  releaseSpeedKmh: number;
  /**
   * Minimum gap (ms) between the end of one rep and the start of the next.
   * Generalizes ThrowDetector's frame-based cooldown to wall-clock time so it
   * is independent of frame rate. Reps closer than this are merged.
   */
  cooldownMs: number;
  /** Minimum peak speed (km/h) for a candidate to count as a real rep. */
  minPeakSpeedKmh: number;
  /** Minimum active duration (ms) for a candidate to count as a real rep. */
  minDurationMs: number;
}

// ── Per-sport defaults ────────────────────────────────

const DEFAULT_CONFIG: RepDetectorConfig = {
  onsetSpeedKmh: 15,
  releaseSpeedKmh: 5,
  cooldownMs: 500,
  minPeakSpeedKmh: 15,
  minDurationMs: 60,
};

const SPORT_CONFIG: Partial<Record<Sport, Partial<RepDetectorConfig>>> = {
  // Fast deliveries; high thresholds avoid counting the run-up as a rep.
  cricket: { onsetSpeedKmh: 30, releaseSpeedKmh: 10, minPeakSpeedKmh: 30, cooldownMs: 800 },
  baseball: { onsetSpeedKmh: 25, releaseSpeedKmh: 8, minPeakSpeedKmh: 25, cooldownMs: 700 },
  tennis: { onsetSpeedKmh: 20, releaseSpeedKmh: 6, minPeakSpeedKmh: 20, cooldownMs: 600 },
  soccer: { onsetSpeedKmh: 20, releaseSpeedKmh: 6, minPeakSpeedKmh: 20, cooldownMs: 600 },
  // Slower, lower-amplitude actions.
  basketball: { onsetSpeedKmh: 10, releaseSpeedKmh: 4, minPeakSpeedKmh: 10, cooldownMs: 500 },
  golf: { onsetSpeedKmh: 12, releaseSpeedKmh: 4, minPeakSpeedKmh: 12, cooldownMs: 500 },
  generic: {},
};

/** Resolve the effective config for a sport, with caller overrides applied last. */
export function repConfigForSport(
  sport: Sport,
  overrides?: Partial<RepDetectorConfig>,
): RepDetectorConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(SPORT_CONFIG[sport] ?? {}),
    ...(overrides ?? {}),
  };
}

// ── Detector ──────────────────────────────────────────

/**
 * Segments a session timeseries into discrete reps using a state machine that
 * mirrors ThrowDetector's onset / release / cooldown logic, but operates over a
 * whole array and reports start/peak/end boundaries instead of a running count.
 *
 * Stateless across calls — construct once and reuse, or call the {@link detectReps}
 * helper for a one-shot segmentation.
 */
export class RepDetector {
  private readonly config: RepDetectorConfig;

  constructor(config: RepDetectorConfig);
  constructor(sport: Sport, overrides?: Partial<RepDetectorConfig>);
  constructor(arg: RepDetectorConfig | Sport, overrides?: Partial<RepDetectorConfig>) {
    this.config =
      typeof arg === 'string'
        ? repConfigForSport(arg, overrides)
        : { ...DEFAULT_CONFIG, ...arg };
  }

  getConfig(): RepDetectorConfig {
    return { ...this.config };
  }

  /**
   * Segment an ordered speed timeseries into reps.
   *
   * @param samples Ordered (ascending timestamp) speed samples for the session.
   * @param _landmarks Optional per-sample landmark frames (same length/order as
   *   `samples`). Reserved for future landmark-driven refinement; the current
   *   implementation segments purely on speed but accepts the frames so callers
   *   already pass them through.
   */
  detect(samples: SpeedSample[], _landmarks?: (Landmark[] | null)[]): Rep[] {
    const { onsetSpeedKmh, releaseSpeedKmh, cooldownMs, minPeakSpeedKmh, minDurationMs } =
      this.config;

    if (samples.length < 2) return [];

    const reps: Rep[] = [];

    let inRep = false;
    let startIndex = -1;
    let peakIndex = -1;
    let peakSpeed = -Infinity;

    const flush = (endIndex: number): void => {
      const start = samples[startIndex];
      const peak = samples[peakIndex];
      const end = samples[endIndex];

      const durationOk = end.timestamp - start.timestamp >= minDurationMs;
      const peakOk = peakSpeed >= minPeakSpeedKmh;

      if (durationOk && peakOk) {
        const candidate: Rep = {
          index: reps.length,
          startMs: start.timestamp,
          peakMs: peak.timestamp,
          endMs: end.timestamp,
          peakSpeedKmh: peakSpeed,
          startIndex,
          peakIndex,
          endIndex,
        };

        // Merge with the previous rep if it starts within the cooldown window —
        // this collapses a single action that briefly dipped below the release
        // threshold into one rep rather than two.
        const prev = reps[reps.length - 1];
        if (prev && candidate.startMs - prev.endMs < cooldownMs) {
          if (candidate.peakSpeedKmh > prev.peakSpeedKmh) {
            prev.peakSpeedKmh = candidate.peakSpeedKmh;
            prev.peakMs = candidate.peakMs;
            prev.peakIndex = candidate.peakIndex;
          }
          prev.endMs = candidate.endMs;
          prev.endIndex = candidate.endIndex;
        } else {
          candidate.index = reps.length;
          reps.push(candidate);
        }
      }

      inRep = false;
      startIndex = -1;
      peakIndex = -1;
      peakSpeed = -Infinity;
    };

    for (let i = 0; i < samples.length; i++) {
      const speed = samples[i].speedKmh;

      if (!inRep) {
        if (speed > onsetSpeedKmh) {
          inRep = true;
          startIndex = i;
          peakIndex = i;
          peakSpeed = speed;
        }
        continue;
      }

      // Active rep: track the peak.
      if (speed > peakSpeed) {
        peakSpeed = speed;
        peakIndex = i;
      }

      // Release: speed dropped back below the release threshold.
      if (speed < releaseSpeedKmh) {
        flush(i);
      }
    }

    // Session ended while still inside a rep — close it on the last sample.
    if (inRep) {
      flush(samples.length - 1);
    }

    // index can drift after merges; renumber to keep them contiguous.
    reps.forEach((rep, i) => {
      rep.index = i;
    });

    return reps;
  }
}

/**
 * One-shot convenience wrapper: build a per-sport detector and segment in a
 * single call.
 */
export function detectReps(
  samples: SpeedSample[],
  sport: Sport = 'generic',
  overrides?: Partial<RepDetectorConfig>,
  landmarks?: (Landmark[] | null)[],
): Rep[] {
  return new RepDetector(sport, overrides).detect(samples, landmarks);
}
