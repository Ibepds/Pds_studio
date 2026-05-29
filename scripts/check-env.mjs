import { existsSync, readFileSync } from 'node:fs'
import { resolveServiceAccountCredentials } from '../server/utils/googleServiceAccount.ts'

function loadEnv() {
  if (!existsSync('.env')) {
    console.error('.env introuvable')
    process.exit(1)
  }
  const text = readFileSync('.env', 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/)
    if (!m) continue
    const k = m[1].trim()
    let v = m[2].trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    process.env[k] = v
  }
}

function report(key) {
  const v = process.env[key]
  if (v === undefined) return { key, status: 'absent' }
  if (!v.trim()) return { key, status: 'empty' }
  if (/^(your-|placeholder|example\.com)/i.test(v.trim()))
    return { key, status: 'placeholder' }
  const secret =
    /SECRET|_KEY|TOKEN|PASSWORD|PRIVATE/i.test(key) && !key.startsWith('NUXT_PUBLIC_')
  if (secret) return { key, status: 'set', length: v.length }
  if (v.trim().startsWith('{')) return { key, status: 'set', looksLike: 'json', length: v.length }
  return { key, status: 'set', length: v.length, preview: v.slice(0, 20) + (v.length > 20 ? '…' : '') }
}

loadEnv()

const required = [
  'NUXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NUXT_PUBLIC_FIREBASE_API_KEY',
  'NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NUXT_PUBLIC_FIREBASE_APP_ID',
  'NUXT_PUBLIC_PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_MODE',
]

const googleKeys = [
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
]

console.log('=== Variables requises ===')
for (const k of required) console.log(report(k))

console.log('\n=== Firebase Admin (une des options) ===')
for (const k of googleKeys) console.log(report(k))

const creds = resolveServiceAccountCredentials({
  projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  jsonInline: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  privateKeyRaw: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
})

console.log('\n=== Résolution compte de service ===')
if (!creds) {
  console.log({ ok: false, reason: 'aucune source valide' })
} else {
  const emailOk = creds.clientEmail.includes('@') && !creds.clientEmail.startsWith('{')
  console.log({
    ok: emailOk && creds.privateKey.includes('BEGIN PRIVATE KEY'),
    projectId: creds.projectId,
    clientEmail: creds.clientEmail.slice(0, 30) + '…',
    privateKeyLines: creds.privateKey.split('\n').length,
    privateKeyLength: creds.privateKey.length,
    emailLooksInvalid: !emailOk,
  })
}

// Détection erreurs courantes
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || ''
const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || ''
if (email.startsWith('{') && !json) {
  console.log('\n⚠ GOOGLE_SERVICE_ACCOUNT_EMAIL contient du JSON : utiliser GOOGLE_SERVICE_ACCOUNT_JSON à la place.')
}
if (json && !json.startsWith('{')) {
  console.log('\n⚠ GOOGLE_SERVICE_ACCOUNT_JSON ne commence pas par { — JSON invalide ou tronqué.')
}
