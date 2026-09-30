import type { Check } from '../types.js'
import { installabilityChecks } from './installability.js'

/**
 * Every check the doctor knows about, in report order.
 *
 * Later categories (permissions, compatibility, cost) get appended here as
 * they are implemented. The order is the order results appear in the report,
 * so put the checks that matter most first.
 */
export const allChecks: Check[] = [...installabilityChecks]

/**
 * Pick the checks to run.
 *
 * An unknown id is a hard error rather than a silent skip — a CI job that
 * thinks it ran a check but did not is worse than a CI job that fails loudly.
 */
export function selectChecks(ids: string[]): Check[] {
  if (ids.length === 0) return allChecks

  const byId = new Map(allChecks.map((check) => [check.id, check]))
  const selected: Check[] = []
  const unknown: string[] = []

  for (const id of ids) {
    const check = byId.get(id)
    if (check) selected.push(check)
    else unknown.push(id)
  }

  if (unknown.length > 0) {
    const known = allChecks.map((check) => check.id).join(', ')
    throw new Error(`unknown check id(s): ${unknown.join(', ')}\nknown ids: ${known}`)
  }

  return selected
}
