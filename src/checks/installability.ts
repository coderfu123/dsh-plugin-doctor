/**
 * Installability checks.
 *
 * WHY THIS CATEGORY EXISTS
 * ------------------------
 * A public audit of the DSH plugin ecosystem found that of 1,883 rejected
 * plugin submissions, 93% were rejected for one reason: **the plugin cannot be
 * installed the way DSH installs plugins**. Most of those repositories contain
 * real, working code — they simply never declared what `dsh plugin add` looks
 * for.
 *
 * So "can it install?" is the single highest-value question the doctor can
 * answer, and it is answered entirely from local files: no network, no running
 * DSH, no guessing.
 *
 * WHAT "INSTALLABLE" MEANS HERE (v0.1)
 * ------------------------------------
 *   1. it declares a bundle patch        -> dsh.bundle.patch
 *   2. that patch file actually exists   -> the declaration is not a lie
 *   3. it depends on DSH                 -> it is really a DSH plugin
 *   4. it has a resolvable entry         -> main points at a real file
 *   5. it is publishable to npm          -> name + version, not private
 *   6. its browser half is well-formed   -> dsh.client is sane, when present
 *
 * THE THREE RULES EVERY CHECK BELOW OBEYS
 * ---------------------------------------
 *   1. NEVER THROW. `package.json` is untrusted input from a stranger's repo,
 *      so every value is re-checked at runtime. A crash here would be reported
 *      as a bug in the doctor, not in the plugin under test — and one bad
 *      manifest would abort the whole run.
 *   2. FAILURES MUST BE ACTIONABLE. The `details` of a `fail` name the literal
 *      key or file the author has to change. "invalid manifest" is useless.
 *   3. NO DOUBLE-COUNTING. One root cause gets exactly one `fail`. Checks that
 *      depend on the same missing declaration return `warn` ("nothing to
 *      verify"), otherwise the failure count and the score become meaningless.
 */

import type { Check, CheckContext, CheckResult } from '../types.js'

/** Does any dependency block mention a DSH package? */
function dshDependencies(ctx: CheckContext): string[] {
  const blocks = [
    ctx.manifest.dependencies,
    ctx.manifest.peerDependencies,
    ctx.manifest.devDependencies,
  ]
  const found = new Set<string>()

  for (const block of blocks) {
    if (!block) continue
    for (const name of Object.keys(block)) {
      if (name.startsWith('@deepseek-ai/')) found.add(name)
    }
  }

  return [...found].sort()
}

// ---------------------------------------------------------------------------
// 1. REFERENCE IMPLEMENTATION — read this one first, then copy the shape.
// ---------------------------------------------------------------------------

/**
 * A DSH plugin must depend on something from the DSH package family.
 *
 * This is one of the three documented reasons submissions get rejected, and it
 * is also the cheapest signal that separates "a repository that added the
 * `dsh-plugin` topic for visibility" from "a repository that is actually a
 * DSH plugin". The audit found a resume generator from 2020 sitting in the
 * ecosystem's top 5 purely because it carried the topic tag.
 */
export const dshDependency: Check = {
  id: 'dsh-dependency',
  title: 'depends on a DSH package',
  category: 'installability',

  async run(ctx): Promise<CheckResult> {
    const found = dshDependencies(ctx)

    if (found.length === 0) {
      return {
        checkId: 'dsh-dependency',
        status: 'fail',
        message: 'no @deepseek-ai/* package in dependencies',
        details: [
          'A DSH plugin is loaded by the DSH loader, so it must depend on the',
          'DSH packages it builds against (for example @deepseek-ai/dsh-base,',
          '@deepseek-ai/dsh-tools, or @deepseek-ai/cordis).',
          'Add the packages you import to "dependencies" and re-run.',
        ],
      }
    }

    return {
      checkId: 'dsh-dependency',
      status: 'pass',
      message: `found ${found.length} DSH package(s)`,
      details: found,
    }
  },
}

// ---------------------------------------------------------------------------
// 2..6 — the rest of the category. Each one is pinned by a test in
//         tests/installability.test.ts and specified in
//         docs/TASK-001-installability.md.
// ---------------------------------------------------------------------------

/**
 * TASK-001a: `dsh plugin add <pkg>` only recognises a package as a DSH bundle
 * when its package.json declares a patch layer:
 *
 *     "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
 *
 * Pass  : `dsh.bundle.patch` is a non-empty string
 * Fail  : the key is missing, empty, or not a string
 * Details: when it fails, tell the author exactly what to add.
 *
 * The traps — `dsh` missing, `dsh` not an object, `bundle` missing, `patch`
 * missing, `patch` a number, `patch` `""` or `"   "` — are all handled by the
 * single guard below.
 */
export const bundleDeclared: Check = {
  id: 'bundle-declared',
  title: 'declares a dsh bundle patch',
  category: 'installability',

  async run(ctx): Promise<CheckResult> {
    // `?.` reads through a missing `dsh`, a missing `bundle`, and a `dsh` that
    // is a string or null — all of which are possible in a hand-written
    // package.json. The `typeof` test then rejects every non-string at once.
    const patch = ctx.manifest.dsh?.bundle?.patch

    if (typeof patch !== 'string' || patch.trim() === '') {
      return {
        checkId: 'bundle-declared',
        status: 'fail',
        message: 'no dsh.bundle.patch declared',
        details: [
          'Without a bundle, `dsh plugin add` does not recognise this package',
          'as a DSH plugin, so it cannot be installed at all — no matter how',
          'good the code is.',
          'Add this to package.json, next to "version":',
          '',
          '  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }',
          '',
          'Then commit the file itself: a declaration alone is not enough, and',
          'patch-file-exists verifies the file is really there.',
        ],
      }
    }

    return {
      checkId: 'bundle-declared',
      status: 'pass',
      message: `declares bundle patch ${patch}`,
      details: [patch],
    }
  },
}

/**
 * TASK-001b: catch a declaration that lies. A plugin can declare
 * `dsh.bundle.patch` and still not install, because the file it points at is
 * not in the published tarball. That is the most common "declared but broken"
 * case.
 *
 * Pass  : a patch is declared AND the referenced file exists
 * Fail  : a patch is declared but the file is missing
 * Warn  : no patch declared at all — bundle-declared already reported the real
 *         problem, so failing here too would double-count one root cause.
 */
export const patchFileExists: Check = {
  id: 'patch-file-exists',
  title: 'the declared patch file exists',
  category: 'installability',

  async run(ctx): Promise<CheckResult> {
    const patch = ctx.manifest.dsh?.bundle?.patch

    // Nothing declared: one root cause, one `fail` — and bundle-declared owns
    // it. `warn` here means "nothing to verify", not "this is fine".
    if (typeof patch !== 'string' || patch.trim() === '') {
      return {
        checkId: 'patch-file-exists',
        status: 'warn',
        message: 'no patch declared — nothing to verify',
        details: ['The missing declaration is reported by the bundle-declared check.'],
      }
    }

    // ctx.exists resolves relative paths against the plugin root and returns
    // false for missing OR escaping paths, so this can never throw.
    if (!(await ctx.exists(patch))) {
      return {
        checkId: 'patch-file-exists',
        status: 'fail',
        message: `declared patch file is missing: ${patch}`,
        details: [
          `package.json declares dsh.bundle.patch = "${patch}", but that file`,
          'is not in the package, so the install fails right after download.',
          '',
          `Either commit the file at "${patch}", or point the key at the path`,
          'you actually ship. If the file does exist locally, check that',
          '"files" in package.json includes it — npm leaves anything not',
          'listed out of the published tarball.',
        ],
      }
    }

    return {
      checkId: 'patch-file-exists',
      status: 'pass',
      message: `patch file present: ${patch}`,
      details: [patch],
    }
  },
}

/**
 * TASK-001c: DSH imports the package by name; if `main` points at a file that
 * is not in the package, the plugin loads nothing and fails at activation with
 * a much worse error message than the doctor can give.
 *
 * Pass  : `main` is set AND the file exists
 * Fail  : `main` is set but the file does not exist
 * Warn  : `main` is not set (some packages are entry-less on purpose, but for
 *         a plugin it is almost always a mistake)
 */
export const entryResolvable: Check = {
  id: 'entry-resolvable',
  title: 'entry point resolves to a real file',
  category: 'installability',

  async run(ctx): Promise<CheckResult> {
    const main = ctx.manifest.main

    if (typeof main !== 'string' || main.trim() === '') {
      return {
        checkId: 'entry-resolvable',
        status: 'warn',
        message: 'no "main" declared — entry point unknown',
        details: [
          'Nothing to verify. For a plugin this is almost always a mistake:',
          'DSH imports the package by name, so without an entry point the',
          'install succeeds and activation fails later.',
          'Add "main": "./lib/index.js" (or your real entry file).',
        ],
      }
    }

    if (!(await ctx.exists(main))) {
      return {
        checkId: 'entry-resolvable',
        status: 'fail',
        message: `"main" points at a file that does not exist: ${main}`,
        details: [
          `package.json declares "main": "${main}", but that file is not in`,
          'the package, so DSH resolves the package and then loads nothing.',
          '',
          `Either ship the file at "${main}", or point "main" at the file you`,
          'actually build — and make sure the build output is listed in',
          '"files" so npm publishes it.',
        ],
      }
    }

    return {
      checkId: 'entry-resolvable',
      status: 'pass',
      message: `entry point resolves: ${main}`,
      details: [main],
    }
  },
}

/**
 * TASK-001d: npm is the only distribution channel a plugin has. DSH installs
 * plugins with pnpm from the npm registry, so a package that cannot be
 * published cannot be installed, no matter how good its code is. The audit
 * found repositories whose host half and browser half were both complete but
 * which were never published — `dsh plugin add` simply could not see them.
 *
 * Fail  : `private` is true, or `name` is missing/blank, or `version` is
 *         missing/blank
 * Pass  : otherwise (details: the exact `name@version` that will be published)
 */
export const publishableName: Check = {
  id: 'publishable-name',
  title: 'publishable to npm',
  category: 'installability',

  async run(ctx): Promise<CheckResult> {
    const { name, version, private: isPrivate } = ctx.manifest

    // Collect every problem instead of returning on the first one: a manifest
    // is often wrong in more than one place, and one report beats three runs.
    const problems: string[] = []

    if (isPrivate === true) {
      problems.push('"private": true — npm refuses to publish a private package')
    }
    if (typeof name !== 'string' || name.trim() === '') {
      problems.push('"name" is missing, empty, or not a string')
    }
    if (typeof version !== 'string' || version.trim() === '') {
      problems.push('"version" is missing, empty, or not a string')
    }

    if (problems.length > 0) {
      return {
        checkId: 'publishable-name',
        status: 'fail',
        message: `cannot be published to npm (${problems.length} problem(s))`,
        details: [
          ...problems.map((problem) => `- ${problem}`),
          '',
          'DSH installs plugins from the npm registry, so a package that is',
          'never published can never be installed by anyone else.',
          'Fix the keys above in package.json and re-run.',
        ],
      }
    }

    return {
      checkId: 'publishable-name',
      status: 'pass',
      message: `publishable as ${name}@${version}`,
      details: [`${name}@${version}`, 'This is the exact name and version npm would publish.'],
    }
  },
}

/**
 * TASK-001e: the browser half is easy to get subtly wrong. A plugin may ship
 * one:
 *
 *     "dsh": { "client": { "platform": "web", "inject": ["..."] } }
 *
 * `platform` is the surface the browser half targets. Today the only value DSH
 * serves is `"web"`; anything else silently never loads.
 *
 * Pass  : no `dsh.client` (a host-only plugin is perfectly valid), OR
 *         `platform === 'web'` and `inject` (when present) is an array of
 *         non-empty strings
 * Fail  : `dsh.client` is present but `platform` is missing or not 'web',
 *         or `inject` is present but not an array of non-empty strings
 */
export const clientHalfValid: Check = {
  id: 'client-half-valid',
  title: 'browser half is well-formed',
  category: 'installability',

  async run(ctx): Promise<CheckResult> {
    // Typed as `unknown` on purpose: `dsh.client` may be any JSON value at
    // runtime, and types.ts describes intent, not a validated fact.
    const client: unknown = ctx.manifest.dsh?.client

    if (client === undefined) {
      return {
        checkId: 'client-half-valid',
        status: 'pass',
        message: 'no browser half declared (host-only plugin)',
      }
    }

    if (typeof client !== 'object' || client === null || Array.isArray(client)) {
      return {
        checkId: 'client-half-valid',
        status: 'fail',
        message: 'dsh.client must be an object',
        details: [
          '`dsh.client` is declared but is not an object, so DSH cannot read',
          'the browser half at all. Use:',
          '',
          '  "dsh": { "client": { "platform": "web", "inject": [] } }',
        ],
      }
    }

    const { platform, inject } = client as { platform?: unknown; inject?: unknown }
    const problems: string[] = []

    if (platform !== 'web') {
      problems.push(
        platform === undefined
          ? '"platform" is missing — DSH only serves "web", so the browser half never loads'
          : `"platform" is ${JSON.stringify(platform)} — DSH only serves "web", so the browser half never loads`,
      )
    }

    if (inject !== undefined) {
      if (!Array.isArray(inject)) {
        problems.push('"inject" is present but is not an array of package names')
      } else {
        const entries: unknown[] = inject
        const bad = entries.filter((entry) => typeof entry !== 'string' || entry.trim() === '')
        if (bad.length > 0) {
          problems.push(`"inject" has ${bad.length} entry/entries that are not non-empty strings`)
        }
      }
    }

    if (problems.length > 0) {
      return {
        checkId: 'client-half-valid',
        status: 'fail',
        message: 'browser half is malformed',
        details: [
          ...problems.map((problem) => `- ${problem}`),
          '',
          'A browser half that never loads costs an afternoon to debug,',
          'because nothing errors — the UI simply never appears.',
          'Fix "platform" / "inject" in the dsh.client block of package.json.',
        ],
      }
    }

    const injected = Array.isArray(inject) && inject.length > 0 ? inject.join(', ') : '(none)'

    return {
      checkId: 'client-half-valid',
      status: 'pass',
      message: 'browser half targets "web" and is well-formed',
      details: [`plugin(s) injected: ${injected}`],
    }
  },
}

/** Every installability check, in report order. */
export const installabilityChecks: Check[] = [
  dshDependency,
  bundleDeclared,
  patchFileExists,
  entryResolvable,
  publishableName,
  clientHalfValid,
]
