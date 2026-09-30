import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { CheckContext, PackageManifest } from './types.js'

/**
 * Read and parse `<dir>/package.json`.
 * Returns `null` when the file is missing or is not valid JSON.
 */
export async function loadManifest(dir: string): Promise<PackageManifest | null> {
  try {
    const raw = await readFile(path.join(dir, 'package.json'), 'utf8')
    return JSON.parse(raw) as PackageManifest
  } catch {
    return null
  }
}

/**
 * Reject anything that escapes the plugin root.
 *
 * This matters more than it looks: the doctor will eventually run over
 * untrusted repositories, and a manifest that points at `../../.ssh/id_rsa`
 * must not turn the doctor itself into the attack.
 */
function resolveInside(dir: string, relPath: string): string {
  if (path.isAbsolute(relPath)) throw new Error(`absolute path rejected: ${relPath}`)
  const resolved = path.resolve(dir, relPath)
  const root = path.resolve(dir)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`path escapes plugin root: ${relPath}`)
  }
  return resolved
}

/** Build the sandboxed view of a plugin that checks are allowed to inspect. */
export function createContext(dir: string, manifest: PackageManifest): CheckContext {
  return {
    dir,
    manifest,

    async readFile(relPath) {
      try {
        return await readFile(resolveInside(dir, relPath), 'utf8')
      } catch {
        return null
      }
    },

    async exists(relPath) {
      try {
        await access(resolveInside(dir, relPath))
        return true
      } catch {
        return false
      }
    },

    async listDir(relPath) {
      try {
        const entries = await readdir(resolveInside(dir, relPath), { withFileTypes: true })
        return entries.map((entry) => entry.name)
      } catch {
        return []
      }
    },
  }
}
