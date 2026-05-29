import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type ServiceAccountCredentials = {
  projectId: string
  clientEmail: string
  privateKey: string
}

type ServiceAccountJson = {
  project_id?: string
  client_email?: string
  private_key?: string
}

/** Normalise une clé PEM (\\n, guillemets, base64). */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim()
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1)
  }
  key = key.replace(/\\n/g, '\n')

  if (!key.includes('BEGIN PRIVATE KEY')) {
    const compact = key.replace(/\s/g, '')
    if (/^[A-Za-z0-9+/=]+$/.test(compact)) {
      try {
        const decoded = Buffer.from(compact, 'base64').toString('utf8')
        if (decoded.includes('BEGIN PRIVATE KEY')) return decoded.replace(/\\n/g, '\n')
      } catch {
        /* ignore */
      }
    }
  }

  return key
}

/** Vérifie qu’une chaîne est un JSON de compte de service valide (sans exposer la clé). */
export function isValidServiceAccountJson(jsonStr: string): boolean {
  try {
    const json = JSON.parse(jsonStr) as ServiceAccountJson
    return Boolean(json.client_email && json.private_key)
  } catch {
    return false
  }
}

function parseJsonCredentials(
  jsonStr: string,
  fallbackProjectId: string,
): ServiceAccountCredentials | null {
  try {
    const json = JSON.parse(jsonStr) as ServiceAccountJson
    if (json.client_email && json.private_key) {
      return {
        projectId: json.project_id || fallbackProjectId,
        clientEmail: json.client_email,
        privateKey: normalizePrivateKey(json.private_key),
      }
    }
  } catch {
    return null
  }
  return null
}

function resolveKeyFilePath(keyFile: string): string {
  const trimmed = keyFile.trim()
  if (!trimmed) return ''
  if (existsSync(trimmed)) return trimmed
  const fromCwd = resolve(process.cwd(), trimmed)
  if (existsSync(fromCwd)) return fromCwd
  return ''
}

/**
 * Résout les identifiants d’un compte de service Google / Firebase.
 * Ordre : JSON inline (Netlify) → fichier JSON (local) → email + clé.
 */
export function resolveServiceAccountCredentials(options: {
  projectId: string
  jsonInline?: string
  keyFile?: string
  email?: string
  privateKeyRaw?: string
}): ServiceAccountCredentials | null {
  const projectId = options.projectId.trim()
  if (!projectId) return null

  const jsonInline = options.jsonInline?.trim()
  if (jsonInline) {
    const fromJson = parseJsonCredentials(jsonInline, projectId)
    if (fromJson) return fromJson
  }

  // Erreur fréquente : JSON collé dans GOOGLE_SERVICE_ACCOUNT_EMAIL
  const emailField = options.email?.trim()
  if (emailField?.startsWith('{')) {
    const fromMisplaced = parseJsonCredentials(emailField, projectId)
    if (fromMisplaced) return fromMisplaced
  }

  const keyFile = options.keyFile?.trim()
  if (keyFile) {
    const keyFilePath = resolveKeyFilePath(keyFile)
    if (keyFilePath) {
      try {
        const fromFile = parseJsonCredentials(readFileSync(keyFilePath, 'utf8'), projectId)
        if (fromFile) return fromFile
      } catch {
        return null
      }
    }
  }

  const email = options.email?.trim()
  const privateKeyRaw = options.privateKeyRaw?.trim()
  if (email && privateKeyRaw) {
    return {
      projectId,
      clientEmail: email,
      privateKey: normalizePrivateKey(privateKeyRaw),
    }
  }

  return null
}
