/**
 * Teste Client ID + Secret PayPal (sandbox ou live).
 * Usage :
 *   PAYPAL_MODE=live NUXT_PUBLIC_PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... node scripts/test-paypal-credentials.mjs
 */
import { readFileSync, existsSync } from 'node:fs'

function loadEnv() {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/)
    if (!m) continue
    let k = m[1].trim()
    let v = m[2].trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

loadEnv()

const mode = (process.env.PAYPAL_MODE || 'sandbox').trim().toLowerCase()
const clientId = (process.env.NUXT_PUBLIC_PAYPAL_CLIENT_ID || '').trim()
const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || '').trim()
const apiBase =
  mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'

console.log({
  mode,
  apiBase,
  clientIdPrefix: clientId ? `${clientId.slice(0, 12)}…` : '(vide)',
  hasSecret: Boolean(clientSecret),
})

if (!clientId || !clientSecret) {
  console.error('Manque NUXT_PUBLIC_PAYPAL_CLIENT_ID ou PAYPAL_CLIENT_SECRET')
  process.exit(1)
}

const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
const res = await fetch(`${apiBase}/v1/oauth2/token`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials',
})

const text = await res.text()
if (!res.ok) {
  console.error(`Token PayPal ${mode.toUpperCase()}: ÉCHEC (${res.status})`)
  console.error(text.slice(0, 400))
  if (res.status === 401 && text.includes('invalid_client')) {
    console.error(
      mode === 'live'
        ? '→ Utilise le Client ID + Secret LIVE (onglet Live sur developer.paypal.com), pas ceux du sandbox.'
        : '→ Vérifie que le secret correspond au Client ID sandbox (même app).',
    )
  }
  process.exit(1)
}

console.log(`Token PayPal ${mode.toUpperCase()}: OK`)
