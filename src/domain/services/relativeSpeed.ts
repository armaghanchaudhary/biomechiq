// src/domain/services/relativeSpeed.ts
// Pure domain logic: frame a speed reading relative to a reference (personal
// best, previous reading) so the *change* — which is far more trustworthy than
// an absolute calibrated number — can be the headline.
// PURE — no React, Expo, or vendor SDK imports.

export interface RelativeSpeed {
  /** The current reading (km/h). */
  current: number;
  /** The reference it's compared against (km/h), e.g. previous or personal best. */
  reference: number;
  /** current - reference (km/h). Positive = faster. */
  delta: number;
  /**
   * Percent change vs. the reference (e.g. 12.5 means +12.5%). Null when the
   * reference is 0 (percent is undefined against a zero baseline).
   */
  percent: number | null;
  /** Direction of the change. */
  direction: 'up' | 'down' | 'same';
}

/**
 * Compare a current speed against an arbitrary reference reading.
 * Deterministic and side-effect free.
 */
export function compareSpeed(current: number, reference: number): RelativeSpeed {
  const safeCurrent = isFinite(current) ? current : 0;
  const safeReference = isFinite(reference) ? reference : 0;

  const delta = safeCurrent - safeReference;
  const percent =
    safeReference === 0 ? null : (delta / Math.abs(safeReference)) * 100;

  let direction: RelativeSpeed['direction'] = 'same';
  if (delta > 0) direction = 'up';
  else if (delta < 0) direction = 'down';

  return { current: safeCurrent, reference: safeReference, delta, percent, direction };
}

/** Frame the current reading against the previous one. */
export function compareToPrevious(current: number, previous: number): RelativeSpeed {
  return compareSpeed(current, previous);
}

export interface PersonalBestComparison extends RelativeSpeed {
  /** True when the current reading meets or beats the personal best. */
  isNewBest: boolean;
}

/**
 * Frame the current reading against a personal best and flag a new record.
 * A reading equal to the existing best is treated as tying (not a new best).
 */
export function compareToPersonalBest(
  current: number,
  personalBest: number,
): PersonalBestComparison {
  const base = compareSpeed(current, personalBest);
  return { ...base, isNewBest: base.current > base.reference };
}

/**
 * Produce a short, human-readable headline emphasising the relative change,
 * e.g. "+4.2 km/h (+12.5%) vs best" or "matched your best".
 * `decimals` controls rounding of the displayed numbers.
 */
export function formatRelativeHeadline(
  rel: RelativeSpeed,
  label = 'last',
  decimals = 1,
): string {
  if (rel.delta === 0) {
    return `matched your ${label}`;
  }
  const sign = rel.delta > 0 ? '+' : '-';
  const absDelta = round(Math.abs(rel.delta), decimals);
  const pctPart =
    rel.percent === null
      ? ''
      : ` (${sign}${round(Math.abs(rel.percent), decimals)}%)`;
  return `${sign}${absDelta} km/h${pctPart} vs ${label}`;
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
