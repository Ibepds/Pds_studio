import { readFileSync } from 'node:fs'
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { depositForSession } from '../../utils/sessionDeposit'

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

function getServiceAccountCredentials(config: ReturnType<typeof useRuntimeConfig>): {
  projectId: string
  clientEmail: string
  privateKey: string
} | null {
  const projectId = (config.public.firebaseProjectId as string)?.trim()
  const keyFile = (config.googleApplicationCredentials as string)?.trim()
  const email = (config.googleServiceAccountEmail as string)?.trim()
  const privateKeyRaw = (config.googleServiceAccountPrivateKey as string)?.trim()

  if (!projectId) return null

  if (email && privateKeyRaw) {
    return {
      projectId,
      clientEmail: email,
      privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
    }
  }

  if (keyFile) {
    try {
      const json = JSON.parse(readFileSync(keyFile, 'utf8')) as {
        project_id?: string
        client_email?: string
        private_key?: string
      }
      if (json.client_email && json.private_key) {
        return {
          projectId: json.project_id || projectId,
          clientEmail: json.client_email,
          privateKey: json.private_key,
        }
      }
    } catch {
      return null
    }
  }

  return null
}

export function getFirebaseAdminFirestore(): Firestore | null {
  const config = useRuntimeConfig()
  const creds = getServiceAccountCredentials(config)
  if (!creds) return null

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
      message:
        'Firebase Admin non configuré (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).',
    })
  }

  const snap = await db.collection('sessions').doc(sessionId).get()
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
      message:
        'Firebase Admin non configuré (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ou GOOGLE_APPLICATION_CREDENTIALS).',
    })
  }

  const ref = db.collection('sessions').doc(sessionId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw createError({ statusCode: 404, message: 'Session introuvable.' })
  }

  const data = snap.data() as Record<string, unknown>
  const status = String(data.status ?? 'waiting_payment')

  if (status === 'pending' && data.paypalOrderId === paypalOrderId) {
    return
  }

  if (status !== 'waiting_payment') {
    throw createError({
      statusCode: 409,
      message: `Cette session n’est pas en attente de paiement (statut: ${status}).`,
    })
  }

  await ref.update({
    status: 'pending',
    paypalOrderId,
  })
}

export function expectedDepositForRecord(session: SessionRecord): number {
  return depositForSession(session)
}
