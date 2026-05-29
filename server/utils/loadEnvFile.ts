import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

let cached: Record<string, string> | null = null
let resolvedEnvPath: string | null = null

/** Racine du repo (parent de `server/`). */
export function getProjectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..')
}

function parseEnvContent(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const k = trimmed.slice(0, eq).trim()
    let v = trimmed.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

/** Cherche `.env` en remontant depuis plusieurs points de départ (Nitro peut avoir un cwd différent). */
export function findEnvFilePath(): string | null {
  if (resolvedEnvPath && existsSync(resolvedEnvPath)) return resolvedEnvPath

  const starts = [
    process.cwd(),
    process.env.NUXT_ROOT_DIR,
    process.env.INIT_CWD,
    getProjectRoot(),
  ].filter(Boolean) as string[]

  for (const start of starts) {
    let dir = resolve(start)
    for (let depth = 0; depth < 8; depth++) {
      const candidate = resolve(dir, '.env')
      if (existsSync(candidate)) {
        resolvedEnvPath = candidate
        return candidate
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}

function loadEnvFileIntoCache(): void {
  if (cached !== null) return
  cached = {}
  const envPath = findEnvFilePath()
  if (!envPath) return
  cached = parseEnvContent(readFileSync(envPath, 'utf8'))
}

/** Charge `.env` du projet dans `process.env` (sans écraser l’existant). À appeler depuis `nuxt.config.ts`. */
export function loadProjectEnv(): void {
  const envPath = findEnvFilePath()
  if (!envPath) return
  const parsed = parseEnvContent(readFileSync(envPath, 'utf8'))
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined || process.env[k] === '') {
      process.env[k] = v
    }
  }
}

/** Lit une variable depuis `.env` (secours si runtimeConfig / process.env vides). */
export function readEnvFileVar(key: string): string | undefined {
  loadEnvFileIntoCache()
  return cached?.[key]
}
