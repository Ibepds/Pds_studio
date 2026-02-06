import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  Timestamp,
  where,
  updateDoc,
} from 'firebase/firestore'
import { computed } from 'vue'
import { getApps, initializeApp } from 'firebase/app'
import { useAuth, type AppUser } from './useAuth'

export type SessionStatus = 'pending' | 'confirmed' | 'done' | 'cancelled'

export interface Session {
  id: string
  bookerId: string
  bookerEmail: string | null
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  endTime: string // HH:mm
  style: string
  beatId?: string
  beatTitle?: string
  beatmakerId?: string
  ingeId?: string
  status: SessionStatus
  paypalOrderId?: string
  durationHours?: number
  totalPrice?: number
  depositAmount?: number
  createdAt: Date
}

const getDb = () => {
  if (!process.client) return null

  if (!getApps().length) {
    const config = useRuntimeConfig()
    const firebaseConfig = {
      apiKey: config.public.firebaseApiKey,
      authDomain: config.public.firebaseAuthDomain,
      projectId: config.public.firebaseProjectId,
      storageBucket: config.public.firebaseStorageBucket,
      messagingSenderId: config.public.firebaseMessagingSenderId,
      appId: config.public.firebaseAppId,
    }
    initializeApp(firebaseConfig)
  }

  return getFirestore()
}

export const useSessions = () => {
  const { currentUser } = useAuth()
  const sessions = useState<Session[]>('sessions', () => [])
  const loading = useState('sessionsLoading', () => false)
  const error = useState<string | null>('sessionsError', () => null)

  // Sessions pour le booker connecté
  const listForCurrentBooker = async () => {
    const db = getDb()
    const user = currentUser.value as AppUser | null
    if (!db || !user) return

    loading.value = true
    error.value = null

    try {
      const col = collection(db, 'sessions')
      const q = query(
        col,
        where('bookerId', '==', user.uid),
        orderBy('date', 'asc'),
        orderBy('startTime', 'asc'),
      )
      const snap = await getDocs(q)

      const data: Session[] = []
      snap.forEach((d) => {
        const raw = d.data() as any
        data.push({
          id: d.id,
          bookerId: raw.bookerId,
          bookerEmail: raw.bookerEmail ?? null,
          date: raw.date,
          startTime: raw.startTime,
          endTime: raw.endTime,
          style: raw.style ?? '',
          beatId: raw.beatId,
          beatTitle: raw.beatTitle,
          beatmakerId: raw.beatmakerId,
          ingeId: raw.ingeId,
          status: raw.status ?? 'pending',
          paypalOrderId: raw.paypalOrderId,
          durationHours: raw.durationHours,
          totalPrice: raw.totalPrice,
          depositAmount: raw.depositAmount,
          createdAt: (raw.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
        })
      })

      sessions.value = data
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors du chargement des sessions'
    } finally {
      loading.value = false
    }
  }

  /** Toutes les sessions pour une date donnée (pour calcul des créneaux déjà pris) */
  const listSessionsForDate = async (date: string): Promise<Session[]> => {
    const db = getDb()
    if (!db) return []

    const col = collection(db, 'sessions')
    const q = query(
      col,
      where('date', '==', date),
      orderBy('startTime', 'asc'),
    )
    const snap = await getDocs(q)
    const data: Session[] = []
    snap.forEach((d) => {
      const raw = d.data() as any
      data.push({
        id: d.id,
        bookerId: raw.bookerId,
        bookerEmail: raw.bookerEmail ?? null,
        date: raw.date,
        startTime: raw.startTime,
        endTime: raw.endTime,
        style: raw.style ?? '',
        beatId: raw.beatId,
        beatTitle: raw.beatTitle,
        beatmakerId: raw.beatmakerId,
        ingeId: raw.ingeId,
        status: raw.status ?? 'pending',
        paypalOrderId: raw.paypalOrderId,
        durationHours: raw.durationHours,
        totalPrice: raw.totalPrice,
        depositAmount: raw.depositAmount,
        createdAt: (raw.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
      })
    })
    return data
  }

  // Sessions pour l'ingé son / beatmaker : pour l’instant, toutes les sessions à partir d’aujourd’hui
  const listAllUpcoming = async () => {
    const db = getDb()
    if (!db) return

    loading.value = true
    error.value = null

    try {
      const today = new Date()
      const iso = today.toISOString().slice(0, 10) // YYYY-MM-DD

      const col = collection(db, 'sessions')
      const q = query(
        col,
        where('date', '>=', iso),
        orderBy('date', 'asc'),
        orderBy('startTime', 'asc'),
      )
      const snap = await getDocs(q)

      const data: Session[] = []
      snap.forEach((d) => {
        const raw = d.data() as any
        data.push({
          id: d.id,
          bookerId: raw.bookerId,
          bookerEmail: raw.bookerEmail ?? null,
          date: raw.date,
          startTime: raw.startTime,
          endTime: raw.endTime,
          style: raw.style ?? '',
          beatId: raw.beatId,
          beatTitle: raw.beatTitle,
          beatmakerId: raw.beatmakerId,
          ingeId: raw.ingeId,
          status: raw.status ?? 'pending',
          paypalOrderId: raw.paypalOrderId,
          durationHours: raw.durationHours,
          totalPrice: raw.totalPrice,
          depositAmount: raw.depositAmount,
          createdAt: (raw.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
        })
      })

      sessions.value = data
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors du chargement des sessions'
    } finally {
      loading.value = false
    }
  }

  const bookSession = async (payload: {
    date: string
    startTime: string
    endTime: string
    style: string
    beatId?: string
    beatTitle?: string
    beatmakerId?: string
    ingeId?: string
    durationHours?: number
    totalPrice?: number
    depositAmount?: number
  }) => {
    const db = getDb()
    const user = currentUser.value as AppUser | null
    if (!db || !user) throw new Error('Utilisateur non connecté')

    loading.value = true
    error.value = null

    try {
      const col = collection(db, 'sessions')
      await addDoc(col, {
        bookerId: user.uid,
        bookerEmail: user.email,
        ...payload,
        status: 'pending',
        createdAt: new Date(),
      })

      await listForCurrentBooker()
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors de la réservation'
      throw e
    } finally {
      loading.value = false
    }
  }

  const groupedByDate = computed(() => {
    const map: Record<string, Session[]> = {}
    for (const s of sessions.value) {
      if (!s || !s.date) continue
      if (!map[s.date]) map[s.date] = []
      map[s.date].push(s)
    }
    return map
  })

  const listForCurrentBeatmaker = async () => {
    const db = getDb()
    const user = currentUser.value as AppUser | null
    if (!db || !user) return

    loading.value = true
    error.value = null

    try {
      const col = collection(db, 'sessions')
      const qSessions = query(
        col,
        where('beatmakerId', '==', user.uid),
        orderBy('date', 'asc'),
        orderBy('startTime', 'asc'),
      )
      const snap = await getDocs(qSessions)

      const data: Session[] = []
      snap.forEach((d) => {
        const raw = d.data() as any
        data.push({
          id: d.id,
          bookerId: raw.bookerId,
          bookerEmail: raw.bookerEmail ?? null,
          date: raw.date,
          startTime: raw.startTime,
          endTime: raw.endTime,
          style: raw.style ?? '',
          beatId: raw.beatId,
          beatTitle: raw.beatTitle,
          beatmakerId: raw.beatmakerId,
          ingeId: raw.ingeId,
          status: raw.status ?? 'pending',
          paypalOrderId: raw.paypalOrderId,
          durationHours: raw.durationHours,
          totalPrice: raw.totalPrice,
          depositAmount: raw.depositAmount,
          createdAt: (raw.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
        })
      })

      sessions.value = data
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors du chargement des sessions beatmaker'
    } finally {
      loading.value = false
    }
  }

  const updateSessionStatus = async (
    sessionId: string,
    status: SessionStatus,
    paypalOrderId?: string,
  ) => {
    const db = getDb()
    if (!db) return

    await updateDoc(doc(db, 'sessions', sessionId), {
      status,
      ...(paypalOrderId ? { paypalOrderId } : {}),
    })

    // On recharge la liste du booker connecté
    await listForCurrentBooker()
  }

  return {
    sessions,
    loading,
    error,
    groupedByDate,
    listForCurrentBooker,
    listAllUpcoming,
    listForCurrentBeatmaker,
    listSessionsForDate,
    bookSession,
    updateSessionStatus,
  }
}

