import type { CheckResult } from './types.js'

/** How much credit each status earns. `fail` is worth nothing on purpose. */
const CREDIT: Record<CheckResult['status'], number> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
}

/**
 * Turn check results into a 0-100 score.
 *
 * Every check counts equally today. When checks become more numerous we will
 * want weights (a security failure should not be diluted by cosmetic passes),
 * but for v0.1 the simple mean keeps the number easy to explain.
 */
export function scoreResults(results: CheckResult[]): number {
  if (results.length === 0) return 0
  const earned = results.reduce((sum, result) => sum + CREDIT[result.status], 0)
  return Math.round((earned / results.length) * 100)
}
