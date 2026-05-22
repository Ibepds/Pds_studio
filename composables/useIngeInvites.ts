import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  setDoc,
  type Firestore,
} from 'firebase/firestore'

export interface IngeInviteDoc {
  createdAt: Date
  createdBy: string
  used: boolean
}

const COLLECTION = 'ingeInvites'

function getDb(): Firestore | null {
  if (!process.client) return null
  if (!getApps().length) {
    const config = useRuntimeConfig()
    initializeApp({
      apiKey: config.public.firebaseApiKey,
      authDomain: config.public.firebaseAuthDomain,
      projectId: config.public.firebaseProjectId,
      storageBucket: config.public.firebaseStorageBucket,
      messagingSenderId: config.public.firebaseMessagingSenderId,
      appId: config.public.firebaseAppId,
    })
  }
  return getFirestore(getApp())
}

/** Code lisible, sans caractères ambigus (0/O, 1/I) */
export function generateIngeInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 12; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]!
  }
  return s
}

export function normalizeIngeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}

export const useIngeInvites = () => {
  const loading = useState('ingeInvitesLoading', () => false)
  const error = useState<string | null>('ingeInvitesError', () => null)

  const createInvite = async (createdByUid: string): Promise<{ code: string; link: string }> => {
    const db = getDb()
    if (!db) throw new Error('Firebase non initialisé')

    loading.value = true
    error.value = null
    try {
      const code = generateIngeInviteCode()
      await setDoc(doc(db, COLLECTION, code), {
        createdAt: new Date(),
        createdBy: createdByUid,
        used: false,
      } satisfies IngeInviteDoc)

      const origin = window.location.origin
      const link = `${origin}/register/inge?code=${encodeURIComponent(code)}`
      return { code, link }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur lors de la création du code'
      error.value = msg
      throw e
    } finally {
      loading.value = false
    }
  }

  const isInviteValid = async (rawCode: string): Promise<boolean> => {
    const db = getDb()
    if (!db) return false
    const code = normalizeIngeInviteCode(rawCode)
    if (!code) return false
    const snap = await getDoc(doc(db, COLLECTION, code))
    if (!snap.exists()) return false
    const data = snap.data() as Partial<IngeInviteDoc>
    return data.used !== true
  }

  /** Réserve le code (suppression) avant création du compte — usage unique */
  const claimInviteCode = async (rawCode: string): Promise<void> => {
    const db = getDb()
    if (!db) throw new Error('Firebase non initialisé')

    const code = normalizeIngeInviteCode(rawCode)
    if (!code) throw new Error('Code d’invitation manquant')

    const ref = doc(db, COLLECTION, code)
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists()) {
        throw new Error('Code d’invitation invalide ou expiré.')
      }
      const data = snap.data() as Partial<IngeInviteDoc>
      if (data.used === true) {
        throw new Error('Ce code a déjà été utilisé.')
      }
      tx.delete(ref)
    })
  }

  return {
    loading,
    error,
    createInvite,
    isInviteValid,
    claimInviteCode,
  }
}
