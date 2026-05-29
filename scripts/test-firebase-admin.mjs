import { readFileSync, existsSync } from 'node:fs'
import { cert, initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { GoogleAuth } from 'google-auth-library'
import { resolveServiceAccountCredentials } from '../server/utils/googleServiceAccount.ts'

function loadEnv() {
  if (!existsSync('.env')) throw new Error('.env introuvable')
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

loadEnv()

const creds = resolveServiceAccountCredentials({
  projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  jsonInline: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  privateKeyRaw: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
})

if (!creds) {
  console.error('Aucun compte de service résolu')
  process.exit(1)
}

console.log({
  projectId: creds.projectId,
  clientEmail: creds.clientEmail,
  keyLen: creds.privateKey.length,
  hasBegin: creds.privateKey.includes('BEGIN PRIVATE KEY'),
  lineCount: creds.privateKey.split('\n').length,
})

try {
  const auth = new GoogleAuth({
    credentials: { client_email: creds.clientEmail, private_key: creds.privateKey },
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const token = await auth.getAccessToken()
  console.log('GoogleAuth token:', token ? 'OK' : 'missing')
} catch (e) {
  console.error('GoogleAuth token:', e.message)
}

try {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: creds.projectId,
        clientEmail: creds.clientEmail,
        privateKey: creds.privateKey,
      }),
      projectId: creds.projectId,
    })
  }
  await getFirestore().collection('sessions').limit(1).get()
  console.log('Firestore: OK')
} catch (e) {
  console.error('Firestore:', e.code, e.message)
  process.exit(1)
}
