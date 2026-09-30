import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Read our own version from package.json so there is one source of truth. */
export function readVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const raw = readFileSync(path.join(here, '..', 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { version?: string }
    return parsed.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}
