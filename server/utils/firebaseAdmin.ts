import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { depositForSession } from '../../utils/sessionDeposit'
import {
  firebaseAdminUserMessage,
  toFrenchFirebaseAdminError,
} from '../../utils/firestoreErrors'
import { findEnvFilePath, readEnvFileVar } from './loadEnvFile'
import {
  isValidServiceAccountJson,
  resolveServiceAccountCredentials,
} from './googleServiceAccount'

export interface SessionRecord {
  id: string
  status: string
  bookerId?: string
  bookerEmail?: string | null
  date?: string
  startTime?: string
  endTime?: string
  durationHours?: number
  depositAmount?: number
  totalPrice?: number
  paypalOrderId?: string
  style?: string
  beatmakerId?: string
  bookingConfirmationSentAt?: Date | null
  bookingNotifiedAt?: Date | null
}

function parseFirestoreDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  return null
}

let adminApp: App | null = null

function envVar(key: string, configValue: string | undefined): string {
  const fromProcess = process.env[key]?.trim()
  if (fromProcess) return fromProcess
  const fromFile = readEnvFileVar(key)?.trim()
  if (fromFile) return fromFile
  return configValue?.trim() || ''
}

/** JSON trop long pour runtimeConfig Nuxt : priorité process.env / .env, puis config si JSON valide. */
function resolveServiceAccountJson(config: ReturnType<typeof useRuntimeConfig>): string {
  const candidates: Array<{ source: string; value: string | undefined }> = [
    { source: 'process.GOOGLE_SERVICE_ACCOUNT_JSON', value: process.env.GOOGLE_SERVICE_ACCOUNT_JSON },
    { source: 'process.NUXT_GOOGLE_SERVICE_ACCOUNT_JSON', value: process.env.NUXT_GOOGLE_SERVICE_ACCOUNT_JSON },
    { source: 'file.GOOGLE_SERVICE_ACCOUNT_JSON', value: readEnvFileVar('GOOGLE_SERVICE_ACCOUNT_JSON') },
    { source: 'runtimeConfig', value: config.googleServiceAccountJson as string },
    { source: 'process.GOOGLE_SERVICE_ACCOUNT_EMAIL', value: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL },
    { source: 'file.GOOGLE_SERVICE_ACCOUNT_EMAIL', value: readEnvFileVar('GOOGLE_SERVICE_ACCOUNT_EMAIL') },
  ]

  for (const { value } of candidates) {
    const trimmed = value?.trim()
    if (trimmed && isValidServiceAccountJson(trimmed)) return trimmed
  }

  return ''
}

function getServiceAccountCredentials(config: ReturnType<typeof useRuntimeConfig>) {
  const projectId =
    (config.public.firebaseProjectId as string)?.trim() ||
    envVar('NUXT_PUBLIC_FIREBASE_PROJECT_ID', undefined)
  if (!projectId) return null

  const jsonInline = resolveServiceAccountJson(config)

  return resolveServiceAccountCredentials({
    projectId,
    jsonInline,
    keyFile: envVar('GOOGLE_APPLICATION_CREDENTIALS', config.googleApplicationCredentials as string),
    email:
      envVar('GOOGLE_SERVICE_ACCOUNT_EMAIL', config.googleServiceAccountEmail as string) ||
      envVar('NUXT_GOOGLE_SERVICE_ACCOUNT_EMAIL', undefined),
    privateKeyRaw:
      envVar('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', config.googleServiceAccountPrivateKey as string) ||
      envVar('NUXT_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', undefined),
  })
}

function rethrowFirestoreError(error: unknown): never {
  throw createError({
    statusCode: 503,
    message: toFrenchFirebaseAdminError(error),
  })
}

export function getFirebaseAdminFirestore(): Firestore | null {
  const config = useRuntimeConfig()
  const creds = getServiceAccountCredentials(config)
  if (!creds) {
    const runtimeJson = (config.googleServiceAccountJson as string)?.trim() || ''
    const processJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || ''
    const fileJson = readEnvFileVar('GOOGLE_SERVICE_ACCOUNT_JSON')?.trim() || ''
    console.error('[Firebase Admin] identifiants introuvables', {
      cwd: process.cwd(),
      envFile: findEnvFilePath(),
      runtimeJsonLen: runtimeJson.length,
      runtimeJsonValid: isValidServiceAccountJson(runtimeJson),
      processJsonLen: processJson.length,
      processJsonValid: isValidServiceAccountJson(processJson),
      fileJsonLen: fileJson.length,
      fileJsonValid: isValidServiceAccountJson(fileJson),
    })
    return null
  }

  if (!adminApp) {
    const existing = getApps()[0]
    adminApp =
      existing ??
      initializeApp({
        credential: cert({
          projectId: creds.projectId,
          clientEmail: creds.clientEmail,
          privateKey: creds.privateKey,
        }),
        projectId: creds.projectId,
      })
  }

  return getFirestore(adminApp)
}

export async function getSessionRecord(sessionId: string): Promise<SessionRecord | null> {
  const db = getFirebaseAdminFirestore()
  if (!db) {
    throw createError({
      statusCode: 503,
      message: firebaseAdminUserMessage.notConfigured,
    })
  }

  let snap
  try {
    snap = await db.collection('sessions').doc(sessionId).get()
  } catch (e) {
    rethrowFirestoreError(e)
  }
  if (!snap.exists) return null

  const data = snap.data() as Record<string, unknown>
  return {
    id: snap.id,
    status: String(data.status ?? 'waiting_payment'),
    bookerId: data.bookerId as string | undefined,
    bookerEmail: (data.bookerEmail as string | null | undefined) ?? null,
    date: data.date as string | undefined,
    startTime: data.startTime as string | undefined,
    endTime: data.endTime as string | undefined,
    durationHours: data.durationHours as number | undefined,
    depositAmount: data.depositAmount as number | undefined,
    totalPrice: data.totalPrice as number | undefined,
    paypalOrderId: data.paypalOrderId as string | undefined,
    style: data.style as string | undefined,
    beatmakerId: data.beatmakerId as string | undefined,
    bookingConfirmationSentAt: parseFirestoreDate(data.bookingConfirmationSentAt),
    bookingNotifiedAt: parseFirestoreDate(data.bookingNotifiedAt),
  }
}

export async function markBookingConfirmationSent(sessionId: string): Promise<void> {
  const db = getFirebaseAdminFirestore()
  if (!db) return
  await db.collection('sessions').doc(sessionId).update({
    bookingConfirmationSentAt: new Date(),
  })
}

export async function markBookingNotified(sessionId: string): Promise<void> {
  const db = getFirebaseAdminFirestore()
  if (!db) return
  await db.collection('sessions').doc(sessionId).update({
    bookingNotifiedAt: new Date(),
  })
}

export async function markSessionPaidAfterPaypal(
  sessionId: string,
  paypalOrderId: string,
): Promise<void> {
  const db = getFirebaseAdminFirestore()
  if (!db) {
    throw createError({
      statusCode: 503,
      message: firebaseAdminUserMessage.notConfigured,
    })
  }

  const ref = db.collection('sessions').doc(sessionId)
  let snap
  try {
    snap = await ref.get()
  } catch (e) {
    rethrowFirestoreError(e)
  }
  if (!snap.exists) {
    throw createError({ statusCode: 404, message: firebaseAdminUserMessage.sessionNotFound })
  }

  const data = snap.data() as Record<string, unknown>
  const status = String(data.status ?? 'waiting_payment')

  if (status === 'pending' && data.paypalOrderId === paypalOrderId) {
    return
  }

  if (status !== 'waiting_payment') {
    throw createError({
      statusCode: 409,
      message: firebaseAdminUserMessage.sessionNotPayable(status),
    })
  }

  try {
    await ref.update({
      status: 'pending',
      paypalOrderId,
    })
  } catch (e) {
    rethrowFirestoreError(e)
  }
}

export function expectedDepositForRecord(session: SessionRecord): number {
  return depositForSession(session)
}
