export interface ErrorStats {
  n: number;
  /** Mean of (estimate - reference), mmHg. Positive = the estimate reads high. */
  meanError: number;
  /** Sample standard deviation of the errors, mmHg. */
  sd: number;
  /** Mean absolute error, mmHg. */
  mae: number;
  /** Share of estimates within 10 mmHg of the reference, 0 to 100. */
  pctWithin10: number;
}

export function errorStats(errors: number[], withinMmHg = 10): ErrorStats {
  const n = errors.length;
  if (!n) return { n: 0, meanError: NaN, sd: NaN, mae: NaN, pctWithin10: NaN };
  const mean = errors.reduce((s, e) => s + e, 0) / n;
  const sd = n > 1 ? Math.sqrt(errors.reduce((s, e) => s + (e - mean) ** 2, 0) / (n - 1)) : 0;
  return {
    n, meanError: mean, sd, mae: errors.reduce((s, e) => s + Math.abs(e), 0) / n,
    pctWithin10: (errors.filter((e) => Math.abs(e) <= withinMmHg).length / n) * 100,
  };
}
