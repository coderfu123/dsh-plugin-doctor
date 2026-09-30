/**
 * The specification for installability checks.
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  HOW TO READ THIS FILE
 *
 *  · Everything under "harness" and "reference check" already passes.
 *    If it does not, the bug is in the harness, not in your code.
 *
 *  · Everything under "TASK-001" FAILS on purpose. Each failing test is one
 *    thing you have to implement in src/checks/installability.ts.
 *    Red -> green, one test at a time. That is the whole workflow.
 * ───────────────────────────────────────────────────────────────────────────
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { createContext, loadManifest } from '../src/context.js'
import { allChecks, selectChecks } from '../src/checks/index.js'
import { scoreResults } from '../src/score.js'
import type { Check, CheckResult } from '../src/types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = (name: string): string => path.join(here, 'fixtures', name)

/** Run a single check by id against a fixture. */
async function runCheck(id: string, fixture: string): Promise<CheckResult> {
  const dir = fixtureDir(fixture)
  const manifest = await loadManifest(dir)
  if (manifest === null) throw new Error(`fixture "${fixture}" has no readable package.json`)

  const check = allChecks.find((candidate) => candidate.id === id)
  if (check === undefined) throw new Error(`no check with id "${id}"`)

  return check.run(createContext(dir, manifest))
}

/** Every result for a fixture, keyed by check id. */
async function runAll(fixture: string): Promise<Map<string, CheckResult>> {
  const dir = fixtureDir(fixture)
  const manifest = await loadManifest(dir)
  if (manifest === null) throw new Error(`fixture "${fixture}" has no readable package.json`)

  const ctx = createContext(dir, manifest)
  const entries = await Promise.all(
    allChecks.map(async (check): Promise<[string, CheckResult]> => [check.id, await check.run(ctx)]),
  )
  return new Map(entries)
}

/**
 * Guard for every "this should fail" assertion.
 *
 * A not-yet-implemented check returns `status: 'fail'`, so a bare
 * `expect(status).toBe('fail')` would be green from day one and hide the fact
 * that nothing is implemented. Call this first in negative tests.
 */
function expectImplemented(result: CheckResult): void {
  expect(result.message).not.toMatch(/NOT IMPLEMENTED/i)
}

// ─────────────────────────────────────────────────────────────────────────────
// Harness — already implemented. These guard the plumbing you build on.
// ─────────────────────────────────────────────────────────────────────────────

describe('harness: scoring', () => {
  const result = (status: CheckResult['status']): CheckResult => ({
    checkId: 'x',
    status,
    message: 'x',
  })

  it('scores a clean plugin 100', () => {
    expect(scoreResults([result('pass'), result('pass')])).toBe(100)
  })

  it('scores an all-failing plugin 0', () => {
    expect(scoreResults([result('fail'), result('fail')])).toBe(0)
  })

  it('counts a warning as half credit', () => {
    expect(scoreResults([result('pass'), result('fail')])).toBe(50)
    expect(scoreResults([result('pass'), result('warn')])).toBe(75)
  })

  it('scores an empty run as 0 rather than NaN', () => {
    expect(scoreResults([])).toBe(0)
  })
})

describe('harness: check registry', () => {
  it('selects every check when no id is given', () => {
    expect(selectChecks([])).toHaveLength(allChecks.length)
  })

  it('filters by id', () => {
    expect(selectChecks(['bundle-declared']).map((c) => c.id)).toEqual(['bundle-declared'])
  })

  it('throws on an unknown id instead of silently skipping', () => {
    expect(() => selectChecks(['does-not-exist'])).toThrow(/unknown check id/i)
  })

  it('gives every check a unique id', () => {
    const ids = allChecks.map((check) => check.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('harness: context is sandboxed', () => {
  it('refuses to read outside the plugin root', async () => {
    const dir = fixtureDir('good-plugin')
    const manifest = await loadManifest(dir)
    const ctx = createContext(dir, manifest!)
    expect(await ctx.readFile('../../../package.json')).toBeNull()
    expect(await ctx.readFile('/etc/hosts')).toBeNull()
  })

  it('returns null / [] for missing paths instead of throwing', async () => {
    const dir = fixtureDir('good-plugin')
    const manifest = await loadManifest(dir)
    const ctx = createContext(dir, manifest!)
    expect(await ctx.readFile('nope.txt')).toBeNull()
    expect(await ctx.exists('nope.txt')).toBe(false)
    expect(await ctx.listDir('nope')).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Reference check — study the shape, then mirror it for the rest.
// ─────────────────────────────────────────────────────────────────────────────

describe('installability: dsh-dependency (reference)', () => {
  it('passes when a DSH package is a dependency', async () => {
    const result = await runCheck('dsh-dependency', 'good-plugin')
    expect(result.status).toBe('pass')
  })

  it('fails when nothing from the DSH family is declared', async () => {
    const result = await runCheck('dsh-dependency', 'bad-plugin')
    expect(result.status).toBe('fail')
    // A useful failure tells the author what to do, not just what is wrong.
    expect(result.details?.join(' ')).toMatch(/dependencies/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-001 — YOUR PART. Every test below fails until you implement the check.
// Spec and hints: docs/TASK-001-installability.md
// ─────────────────────────────────────────────────────────────────────────────

describe('TASK-001a: bundle-declared', () => {
  it('passes when dsh.bundle.patch is a non-empty string', async () => {
    expect((await runCheck('bundle-declared', 'good-plugin')).status).toBe('pass')
  })

  it('fails when the plugin declares no bundle at all', async () => {
    const result = await runCheck('bundle-declared', 'bad-plugin')
    expectImplemented(result)
    expect(result.status).toBe('fail')
  })

  it('tells the author what to add when it fails', async () => {
    const result = await runCheck('bundle-declared', 'bad-plugin')
    expectImplemented(result)
    expect(result.details?.join(' ')).toMatch(/dsh[\s\S]*bundle[\s\S]*patch/i)
  })
})

describe('TASK-001b: patch-file-exists', () => {
  it('passes when the declared patch file is present', async () => {
    expect((await runCheck('patch-file-exists', 'good-plugin')).status).toBe('pass')
  })

  it('fails when a patch is declared but the file is missing', async () => {
    const result = await runCheck('patch-file-exists', 'half-baked')
    expectImplemented(result)
    expect(result.status).toBe('fail')
  })

  it('warns (does not fail) when no patch is declared at all', async () => {
    // bundle-declared already reports the real problem; do not double-count it.
    expect((await runCheck('patch-file-exists', 'bad-plugin')).status).toBe('warn')
  })
})

describe('TASK-001c: entry-resolvable', () => {
  it('passes when main points at a file that exists', async () => {
    expect((await runCheck('entry-resolvable', 'good-plugin')).status).toBe('pass')
  })

  it('fails when main points at a file that is not there', async () => {
    const result = await runCheck('entry-resolvable', 'bad-plugin')
    expectImplemented(result)
    expect(result.status).toBe('fail')
  })

  it('warns when main is not declared at all', async () => {
    expect((await runCheck('entry-resolvable', 'half-baked')).status).toBe('warn')
  })
})

describe('TASK-001d: publishable-name', () => {
  it('passes for a package npm could publish', async () => {
    expect((await runCheck('publishable-name', 'good-plugin')).status).toBe('pass')
  })

  it('fails for a package marked private', async () => {
    const result = await runCheck('publishable-name', 'bad-plugin')
    expectImplemented(result)
    expect(result.status).toBe('fail')
  })
})

describe('TASK-001e: client-half-valid', () => {
  it('passes when the plugin has no browser half', async () => {
    expect((await runCheck('client-half-valid', 'bad-plugin')).status).toBe('pass')
  })

  it('passes for a well-formed web browser half', async () => {
    expect((await runCheck('client-half-valid', 'good-plugin')).status).toBe('pass')
  })

  it('fails when platform is not "web" or inject is malformed', async () => {
    const result = await runCheck('client-half-valid', 'half-baked')
    expectImplemented(result)
    expect(result.status).toBe('fail')
    expect(result.details?.join(' ')).toMatch(/platform|inject/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end shape: once TASK-001 is done these should hold exactly.
// ─────────────────────────────────────────────────────────────────────────────

describe('installability: whole-fixture expectations', () => {
  it('a fully valid plugin passes every check', async () => {
    const results = await runAll('good-plugin')
    for (const [id, result] of results) {
      expect(result.status, `${id} should pass for good-plugin`).toBe('pass')
    }
  })

  it('the classic "not packaged for DSH" repo fails the three documented checks', async () => {
    const results = await runAll('bad-plugin')
    expect(results.get('dsh-dependency')?.status).toBe('fail')
    expect(results.get('bundle-declared')?.status).toBe('fail')
    expect(results.get('entry-resolvable')?.status).toBe('fail')
    // and it must not be punished twice for the same missing declaration
    expect(results.get('patch-file-exists')?.status).toBe('warn')
  })

  it('a half-baked plugin is caught rather than trusted', async () => {
    const results = await runAll('half-baked')
    expect(results.get('patch-file-exists')?.status).toBe('fail')
    expect(results.get('client-half-valid')?.status).toBe('fail')
    expect(results.get('entry-resolvable')?.status).toBe('warn')
  })
})
