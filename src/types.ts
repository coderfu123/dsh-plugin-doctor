/**
 * Core contracts for dsh-plugin-doctor.
 *
 * ============================================================================
 *  THIS FILE IS THE CONTRACT between the harness (already written for you)
 *  and the checks (the part you implement in src/checks/).
 *
 *  Do not change the shapes in this file unless you also update the tests in
 *  tests/ — the tests are the specification, this file is just its typing.
 * ============================================================================
 */

/** Severity of a single check outcome. */
export type CheckStatus = 'pass' | 'warn' | 'fail'

/** Category, used only for grouping results in the report. */
export type CheckCategory =
  | 'installability'
  | 'permissions'
  | 'compatibility'
  | 'cost'

/** Outcome of one check against one plugin. */
export interface CheckResult {
  /** Stable id of the check that produced this result. */
  checkId: string
  status: CheckStatus
  /** One-line, human-readable conclusion. Shown next to the check title. */
  message: string
  /**
   * Optional extra lines: the evidence you found, file paths, and a concrete
   * suggestion. Keep each line short; the reporter indents them.
   */
  details?: string[]
}

/**
 * A single check.
 *
 * Rules:
 *  - `id` is a stable kebab-case string and must never change once released,
 *    because reports are diffed across versions by id.
 *  - `run` must NEVER throw. If something goes wrong, return a `fail` result
 *    with the reason in `message`. A thrown error aborts the whole run and is
 *    counted as a bug in the doctor, not in the plugin under test.
 */
export interface Check {
  id: string
  title: string
  category: CheckCategory
  run(ctx: CheckContext): Promise<CheckResult>
}

/** The DSH-relevant subset of a plugin's package.json. */
export interface PackageManifest {
  name?: string
  version?: string
  private?: boolean
  type?: string
  main?: string
  exports?: unknown
  files?: string[]
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  dsh?: {
    /** A bundle declares a patch layer; this is what `dsh plugin add` looks for. */
    bundle?: { patch?: string }
    /** A profile manifest (used by profile packages, not by plugins). */
    profile?: unknown
    /** The browser half of a plugin. */
    client?: { platform?: string; inject?: string[] }
  }
}

/**
 * Everything a check is allowed to look at.
 *
 * v0.1 is strictly local: no network, no shelling out. That keeps every check
 * deterministic and fast, and makes it trivially testable with fixtures.
 */
export interface CheckContext {
  /** Absolute path of the plugin package root (the folder holding package.json). */
  dir: string
  /** Parsed package.json. Guaranteed present: the runner aborts before running checks if it is missing. */
  manifest: PackageManifest
  /** Read a UTF-8 file relative to `dir`. Returns `null` when it does not exist. */
  readFile(relPath: string): Promise<string | null>
  /** Does a path (file or directory) exist relative to `dir`? */
  exists(relPath: string): Promise<boolean>
  /** Names of the entries in a directory relative to `dir`. `[]` when missing. */
  listDir(relPath: string): Promise<string[]>
}

/** The full report for one plugin. */
export interface PluginReport {
  /** Absolute path the plugin was read from. */
  dir: string
  name: string
  version: string
  results: CheckResult[]
  /** Weighted 0-100 score, computed by the harness (see src/score.ts). */
  score: number
}
