// src/domain/services/bestRep.ts
// Pure domain logic: pick the "highlight" rep(s) from a segmented session for
// auto-highlight clipping. Scores each rep on speed and (optionally) form, then
// ranks them so the UI can clip the single most impressive swing/throw, or a
// top-N reel.
// PURE — no React, Expo, or vendor SDK imports.

import { Rep } from './repDetector';

/**
 * A per-rep form score, keyed by the rep's `index` so callers can supply scores
 * computed separately (e.g. via computeFormScore at each rep's peak frame).
 */
export interface RepFormScore {
  /** Matches Rep.index. */
  index: number;
  /** Form score 0–100. */
  formScore: number;
}

/** A rep annotated with the scores used to rank it. */
export interface ScoredRep {
  rep: Rep;
  /** Peak speed (km/h) for the rep. */
  peakSpeedKmh: number;
  /** Form score 0–100 for the rep, or null when none was supplied. */
  formScore: number | null;
  /**
   * Combined highlight score (higher is better). Blends normalized speed and
   * form per the active weighting. When no form score is available the speed
   * component carries the full weight.
   */
  score: number;
}

export interface BestRepConfig {
  /**
   * Weight on the (normalized) speed component, 0–1. The form component gets
   * (1 - speedWeight). Default 0.7 — speed-led but form-aware.
   */
  speedWeight: number;
}

const DEFAULT_CONFIG: BestRepConfig = {
  speedWeight: 0.7,
};

/**
 * Score and rank reps for highlight selection.
 *
 * Speed is normalized 0–1 against the fastest rep in the set so the blend is
 * scale-independent across sports (a 12 km/h putt and a 120 km/h serve both
 * normalize to 1.0 when they're the fastest in their own session). Form is
 * already 0–100 and is normalized to 0–1.
 *
 * Reps with an explicit form score are blended; reps without one fall back to
 * pure (normalized) speed so a session that never computed form still ranks
 * sensibly. Ties are broken by raw peak speed, then by rep index, so the result
 * is stable and deterministic.
 */
export function scoreReps(
  reps: Rep[],
  formScores: RepFormScore[] = [],
  config: Partial<BestRepConfig> = {},
): ScoredRep[] {
  if (reps.length === 0) return [];

  const { speedWeight } = { ...DEFAULT_CONFIG, ...config };
  const clampedSpeedWeight = Math.max(0, Math.min(1, speedWeight));
  const formWeight = 1 - clampedSpeedWeight;

  const formByIndex = new Map<number, number>();
  for (const fs of formScores) {
    if (isFinite(fs.formScore)) formByIndex.set(fs.index, fs.formScore);
  }

  const maxSpeed = Math.max(...reps.map((r) => r.peakSpeedKmh));

  const scored: ScoredRep[] = reps.map((rep) => {
    const formScore = formByIndex.has(rep.index)
      ? formByIndex.get(rep.index)!
      : null;

    const normSpeed = maxSpeed > 0 ? rep.peakSpeedKmh / maxSpeed : 0;

    let score: number;
    if (formScore === null) {
      // No form info: rank on speed alone.
      score = normSpeed;
    } else {
      const normForm = Math.max(0, Math.min(1, formScore / 100));
      score = clampedSpeedWeight * normSpeed + formWeight * normForm;
    }

    return {
      rep,
      peakSpeedKmh: rep.peakSpeedKmh,
      formScore,
      score,
    };
  });

  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.peakSpeedKmh !== a.peakSpeedKmh) return b.peakSpeedKmh - a.peakSpeedKmh;
    return a.rep.index - b.rep.index;
  });
}

/**
 * Select the single highlight rep, or null when there are no reps.
 */
export function selectBestRep(
  reps: Rep[],
  formScores: RepFormScore[] = [],
  config: Partial<BestRepConfig> = {},
): ScoredRep | null {
  const scored = scoreReps(reps, formScores, config);
  return scored[0] ?? null;
}

/**
 * Select the top-N highlight reps (highest combined score first) for a reel.
 * Returns at most `n` reps; fewer when the session has fewer reps.
 */
export function selectTopReps(
  reps: Rep[],
  n: number,
  formScores: RepFormScore[] = [],
  config: Partial<BestRepConfig> = {},
): ScoredRep[] {
  if (n <= 0) return [];
  return scoreReps(reps, formScores, config).slice(0, n);
}

/**
 * Convenience: the fastest rep purely by peak speed, ignoring form.
 * Useful for a "top speed" highlight independent of the blended ranking.
 */
export function selectFastestRep(reps: Rep[]): Rep | null {
  if (reps.length === 0) return null;
  return reps.reduce((best, r) =>
    r.peakSpeedKmh > best.peakSpeedKmh ? r : best,
  );
}
