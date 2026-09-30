import type { Check, CheckContext, CheckResult, PluginReport } from './types.js'
import { scoreResults } from './score.js'

/**
 * Run every check against one plugin.
 *
 * A check that throws is caught and reported as a `fail` — but with a message
 * that makes it obvious the bug is in the check, not in the plugin. A doctor
 * that crashes on a weird plugin is a doctor nobody runs in CI.
 */
export async function runChecks(checks: Check[], ctx: CheckContext): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  for (const check of checks) {
    try {
      results.push(await check.run(ctx))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      results.push({
        checkId: check.id,
        status: 'fail',
        message: `check crashed (doctor bug, not a plugin bug): ${reason}`,
      })
    }
  }

  return results
}

/** Assemble the final report for a plugin. */
export function buildReport(
  dir: string,
  name: string,
  version: string,
  results: CheckResult[],
): PluginReport {
  return { dir, name, version, results, score: scoreResults(results) }
}
