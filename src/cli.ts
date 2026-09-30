import path from 'node:path'
import { createContext, loadManifest } from './context.js'
import { selectChecks } from './checks/index.js'
import { buildReport, runChecks } from './runner.js'
import { renderJson, renderText, shouldUseColor } from './report.js'
import { readVersion } from './version.js'

const USAGE = `dsh-plugin-doctor — static health checks for DeepSeek Harness plugins

Usage:
  dsh-plugin-doctor [path] [options]

Arguments:
  path                 plugin package root, i.e. the folder holding package.json
                       (default: the current directory)

Options:
  --check <id>         run only these checks; repeatable, and comma-separated
                       values are accepted (--check a,b)
  --json               machine-readable output on stdout
  --color              force ANSI colour
  --no-color           disable ANSI colour (also honours NO_COLOR)
  -h, --help           show this help
  -v, --version        print the doctor's version

Exit codes:
  0  no check failed
  1  at least one check failed
  2  usage error, or the path has no readable package.json

Examples:
  dsh-plugin-doctor .
  dsh-plugin-doctor ./my-plugin --check bundle-declared
  dsh-plugin-doctor ./my-plugin --json > report.json`

export interface Options {
  dir: string
  checkIds: string[]
  json: boolean
  color: boolean | null
  help: boolean
  version: boolean
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Parse argv. Throws on anything the CLI cannot honour. */
export function parseArgs(argv: string[]): Options {
  const options: Options = {
    dir: '.',
    checkIds: [],
    json: false,
    color: null,
    help: false,
    version: false,
  }
  const positional: string[] = []

  const addCheckIds = (value: string): void => {
    for (const id of value.split(',')) {
      const trimmed = id.trim()
      if (trimmed !== '') options.checkIds.push(trimmed)
    }
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) continue

    if (arg === '-h' || arg === '--help') {
      options.help = true
    } else if (arg === '-v' || arg === '--version') {
      options.version = true
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--color') {
      options.color = true
    } else if (arg === '--no-color') {
      options.color = false
    } else if (arg === '--check') {
      const value = argv[index + 1]
      if (value === undefined) throw new Error('--check needs a value')
      addCheckIds(value)
      index += 1
    } else if (arg.startsWith('--check=')) {
      addCheckIds(arg.slice('--check='.length))
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`)
    } else {
      positional.push(arg)
    }
  }

  if (positional.length > 1) {
    throw new Error(`expected at most one path, received ${positional.length}`)
  }
  const first = positional[0]
  if (first !== undefined) options.dir = first

  return options
}

/** Run the CLI. Returns the process exit code instead of exiting, so it is testable. */
export async function main(argv: string[]): Promise<number> {
  let options: Options
  try {
    options = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`${errorText(error)}\n\n${USAGE}\n`)
    return 2
  }

  if (options.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }

  if (options.version) {
    process.stdout.write(`${readVersion()}\n`)
    return 0
  }

  const dir = path.resolve(options.dir)
  const manifest = await loadManifest(dir)
  if (manifest === null) {
    process.stderr.write(`dsh-plugin-doctor: no readable package.json in ${dir}\n`)
    return 2
  }

  let checks
  try {
    checks = selectChecks(options.checkIds)
  } catch (error) {
    process.stderr.write(`${errorText(error)}\n`)
    return 2
  }

  const ctx = createContext(dir, manifest)
  const results = await runChecks(checks, ctx)

  const report = buildReport(
    dir,
    manifest.name ?? '(unnamed)',
    manifest.version ?? '0.0.0',
    results,
  )

  const useColor = shouldUseColor(options.color)
  const output = options.json ? renderJson(report) : renderText(report, useColor)
  process.stdout.write(`${output}\n`)

  return results.some((result) => result.status === 'fail') ? 1 : 0
}
