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

export type SessionStatus =
  | 'waiting_payment' // réservation créée mais acompte non payé
  | 'pending' // acompte payé, en attente de confirmation ingé
  | 'confirmed'
  | 'done'
  | 'cancelled'

export interface Session {
  id: string
  bookerId: string
  bookerEmail: string | null
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  endTime: string // HH:mm
  style: string
  /** Nom libre donné par le booker pour identifier la réservation (souvent « Prénom Nom ») */
  reservationName?: string
  bookerPhone?: string
  /** Informations complémentaires saisies à la réservation */
  bookerNotes?: string
  beatId?: string
  beatTitle?: string
  beatmakerId?: string
  ingeId?: string
  bookerProdUrl?: string
  bookerProdFileName?: string
  status: SessionStatus
  paypalOrderId?: string
  durationHours?: number
  totalPrice?: number
  depositAmount?: number
  /** Si défini, le récap a été envoyé par mail à cette date */
  recapSentAt?: Date | null
  /** Montant restant à payer (€). Si défini, on l'affiche ; sinon on calcule totalPrice - depositAmount. Mettre à 0 quand tout est payé. */
  remainingToPay?: number | null
  /** Note sur 5 (avis studio après session) */
  reviewRating?: number | null
  /** Commentaire sur ce qui a été produit */
  reviewNotes?: string | null
  reviewSentAt?: Date | null
  reviewedBy?: string | null
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

function parseSessionDoc(id: string, raw: Record<string, unknown>): Session {
  return {
    id,
    bookerId: raw.bookerId as string,
    bookerEmail: (raw.bookerEmail as string | null) ?? null,
    date: raw.date as string,
    startTime: raw.startTime as string,
    endTime: raw.endTime as string,
    style: (raw.style as string) ?? '',
    reservationName: raw.reservationName as string | undefined,
    bookerPhone: raw.bookerPhone as string | undefined,
    bookerNotes: raw.bookerNotes as string | undefined,
    beatId: raw.beatId as string | undefined,
    beatTitle: raw.beatTitle as string | undefined,
    beatmakerId: raw.beatmakerId as string | undefined,
    ingeId: raw.ingeId as string | undefined,
    bookerProdUrl: raw.bookerProdUrl as string | undefined,
    bookerProdFileName: raw.bookerProdFileName as string | undefined,
    status: (raw.status as SessionStatus | undefined) ?? 'waiting_payment',
    paypalOrderId: raw.paypalOrderId as string | undefined,
    durationHours: raw.durationHours as number | undefined,
    totalPrice: raw.totalPrice as number | undefined,
    depositAmount: raw.depositAmount as number | undefined,
    recapSentAt:
      (raw.recapSentAt as Timestamp | undefined)?.toDate?.() ??
      (raw.recapSentAt as Date | undefined) ??
      null,
    remainingToPay: raw.remainingToPay !== undefined ? (raw.remainingToPay as number) : undefined,
    reviewRating:
      raw.reviewRating !== undefined && raw.reviewRating !== null
        ? Number(raw.reviewRating)
        : undefined,
    reviewNotes: (raw.reviewNotes as string | undefined) ?? undefined,
    reviewSentAt:
      (raw.reviewSentAt as Timestamp | undefined)?.toDate?.() ??
      (raw.reviewSentAt as Date | undefined) ??
      null,
    reviewedBy: (raw.reviewedBy as string | undefined) ?? undefined,
    createdAt: (raw.createdAt as Timestamp | undefined)?.toDate?.() ?? new Date(),
  }
}

export const useSessions = () => {
  const { currentUser } = useAuth()
  const sessions = useState<Session[]>('sessions', () => [])
  const loading = useState('sessionsLoading', () => false)
  const error = useState<string | null>('sessionsError', () => null)

  // Sessions pour le booker connecté (sans orderBy pour éviter l'index composite Firestore)
  const listForCurrentBooker = async () => {
    const db = getDb()
    const user = currentUser.value as AppUser | null
    if (!db || !user) {
      sessions.value = []
      return
    }

    loading.value = true
    error.value = null

    try {
      const col = collection(db, 'sessions')
      const q = query(col, where('bookerId', '==', user.uid))
      const snap = await getDocs(q)

      const data: Session[] = []
      snap.forEach((d) => {
        const raw = d.data() as any
        data.push(parseSessionDoc(d.id, raw))
      })
      data.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      sessions.value = data
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors du chargement des sessions'
    } finally {
      loading.value = false
    }
  }

  /** Sessions occupant un créneau sur une date (hors annulées / terminées). Requête filtrée pour les invités (règles Firestore). */
  const listSessionsForDate = async (date: string): Promise<Session[]> => {
    const db = getDb()
    if (!db) return []

    const col = collection(db, 'sessions')
    const q = query(
      col,
      where('date', '==', date),
      where('status', 'in', ['pending', 'confirmed']),
    )
    const snap = await getDocs(q)
    const data: Session[] = []
    snap.forEach((d) => {
      data.push(parseSessionDoc(d.id, d.data() as Record<string, unknown>))
    })
    data.sort((a, b) => (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0))
    return data
  }

  /** Sessions en attente de paiement pour un nom de réservation donné (pour les invités). */
  const findUnpaidByReservationName = async (
    reservationName: string,
  ): Promise<Session[]> => {
    const db = getDb()
    if (!db) return []
    const trimmed = reservationName.trim()
    if (!trimmed) return []

    const col = collection(db, 'sessions')
    const q = query(col, where('reservationName', '==', trimmed))
    const snap = await getDocs(q)
    const data: Session[] = []
    snap.forEach((d) => {
      data.push(parseSessionDoc(d.id, d.data() as Record<string, unknown>))
    })
    // On ne garde que les réservations en attente de paiement
    return data.filter((s) => s.status === 'waiting_payment')
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
      const q = query(col, where('date', '>=', iso))
      const snap = await getDocs(q)

      const data: Session[] = []
      snap.forEach((d) => {
        data.push(parseSessionDoc(d.id, d.data() as Record<string, unknown>))
      })
      data.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
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
    reservationName?: string
    bookerPhone?: string
    bookerNotes?: string
    beatId?: string
    beatTitle?: string
    beatmakerId?: string
    ingeId?: string
    bookerProdUrl?: string
    bookerProdFileName?: string
    durationHours?: number
    totalPrice?: number
    depositAmount?: number
    /** Email de contact saisi dans le formulaire (permet la réservation en invité) */
    contactEmail?: string
  }) => {
    const db = getDb()
    const user = currentUser.value as AppUser | null
    if (!db) throw new Error('Application non prête. Rechargez la page.')

    const contactEmail = (payload.contactEmail || user?.email || null) as string | null
    const bookerId = user?.uid || (contactEmail ? `guest:${contactEmail}` : `guest:${Date.now()}`)

    // On ne persiste pas contactEmail en double, on le mappe vers bookerEmail
    const { contactEmail: _contactEmail, ...restPayload } = payload

    loading.value = true
    error.value = null

    try {
      const col = collection(db, 'sessions')
      const raw: Record<string, unknown> = {
        bookerId,
        bookerEmail: contactEmail,
        ...restPayload,
        status: 'waiting_payment',
        createdAt: new Date(),
      }
      const data = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v !== undefined),
      ) as Record<string, unknown>
      const docRef = await addDoc(col, data)

      // Si un booker est connecté, on rafraîchit sa liste
      if (user) {
        await listForCurrentBooker()
      }
      return docRef.id
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
      const key = s.date
      if (!map[key]) map[key] = []
      map[key]!.push(s)
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
        data.push(
          parseSessionDoc(d.id, {
            ...d.data(),
            status: (d.data() as { status?: SessionStatus }).status,
          } as Record<string, unknown>),
        )
      })

      sessions.value = data
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors du chargement des sessions beatmaker'
    } finally {
      loading.value = false
    }
  }

  /** Toutes les sessions assignées à l’ingé connecté (passées et à venir). */
  const listForCurrentInge = async () => {
    const db = getDb()
    const user = currentUser.value as AppUser | null
    if (!db || !user) return

    loading.value = true
    error.value = null

    try {
      const col = collection(db, 'sessions')
      const qSessions = query(
        col,
        where('ingeId', '==', user.uid),
        orderBy('date', 'asc'),
        orderBy('startTime', 'asc'),
      )
      const snap = await getDocs(qSessions)

      const data: Session[] = []
      snap.forEach((d) => {
        data.push(
          parseSessionDoc(d.id, {
            ...d.data(),
            status: (d.data() as { status?: SessionStatus }).status,
          } as Record<string, unknown>),
        )
      })

      sessions.value = data
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors du chargement des sessions ingé'
    } finally {
      loading.value = false
    }
  }

  /** Toutes les sessions à partir d’une date (pour admin) */
  const listAllFromDate = async (fromDate: string): Promise<Session[]> => {
    const db = getDb()
    if (!db) return []
    const col = collection(db, 'sessions')
    const q = query(col, where('date', '>=', fromDate))
    const snap = await getDocs(q)
    const data: Session[] = []
    snap.forEach((d) => {
      data.push(parseSessionDoc(d.id, d.data() as Record<string, unknown>))
    })
    data.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    return data
  }

  /** Sessions dont la date est dans [startDate, endDate] (YYYY-MM-DD), pour stats admin par mois. */
  const listSessionsInDateRange = async (
    startDate: string,
    endDate: string,
  ): Promise<Session[]> => {
    const db = getDb()
    if (!db) return []
    const col = collection(db, 'sessions')
    const q = query(
      col,
      where('date', '>=', startDate),
      where('date', '<=', endDate),
    )
    const snap = await getDocs(q)
    const data: Session[] = []
    snap.forEach((d) => {
      data.push(parseSessionDoc(d.id, d.data() as Record<string, unknown>))
    })
    data.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    return data
  }

  /** Toutes les sessions en attente (pour ingé confirmation et admin) */
  const listAllPending = async (): Promise<Session[]> => {
    const db = getDb()
    if (!db) return []
    const today = new Date().toISOString().slice(0, 10)
    const col = collection(db, 'sessions')
    const q = query(col, where('date', '>=', today))
    const snap = await getDocs(q)
    const data: Session[] = []
    snap.forEach((d) => {
      data.push(parseSessionDoc(d.id, d.data() as Record<string, unknown>))
    })
    const pending = data.filter((s) => s.status === 'pending')
    pending.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    return pending
  }

  const updateSessionStatus = async (
    sessionId: string,
    status: SessionStatus,
    paypalOrderId?: string,
    ingeId?: string,
  ) => {
    const db = getDb()
    if (!db) return

    await updateDoc(doc(db, 'sessions', sessionId), {
      status,
      ...(paypalOrderId ? { paypalOrderId } : {}),
      ...(ingeId ? { ingeId } : {}),
    })

    const user = currentUser.value as AppUser | null
    if (user?.role === 'booker') {
      await listForCurrentBooker()
    }
  }

  /** Marque qu'un récap a été envoyé par mail (appelé après envoi du mail de récap). L'appelant doit rafraîchir sa liste (listForCurrentBooker / listAllFromDate). */
  const updateSessionRecapSent = async (sessionId: string) => {
    const db = getDb()
    if (!db) return
    await updateDoc(doc(db, 'sessions', sessionId), {
      recapSentAt: new Date(),
    })
  }

  /** Met à jour les champs libres d'une session (date, heures, ingéId). Admin uniquement. L'appelant doit rafraîchir sa liste. */
  const updateSessionFields = async (
    sessionId: string,
    fields: { date?: string; startTime?: string; endTime?: string; ingeId?: string },
  ) => {
    const db = getDb()
    if (!db) return
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
    if (Object.keys(clean).length === 0) return
    await updateDoc(doc(db, 'sessions', sessionId), clean)
  }

  /** Met à jour l'ingé son assigné à une session (admin). L'appelant doit rafraîchir sa liste. */
  const updateSessionInge = async (sessionId: string, ingeId: string) => {
    const db = getDb()
    if (!db) return
    await updateDoc(doc(db, 'sessions', sessionId), { ingeId })
  }

  /** Met à jour le reste à payer (0 = tout payé). Admin et ingé peuvent marquer la session comme entièrement payée. L'appelant doit rafraîchir sa liste. */
  const updateSessionRemainingToPay = async (sessionId: string, remainingToPay: number) => {
    const db = getDb()
    if (!db) return
    await updateDoc(doc(db, 'sessions', sessionId), {
      remainingToPay: Math.max(0, remainingToPay),
    })
  }

  /** Sessions confirmées / terminées dont la date de fin est passée — base pour la page avis. */
  const listPastSessions = async (): Promise<Session[]> => {
    const db = getDb()
    if (!db) return []
    const today = new Date().toISOString().slice(0, 10)
    const col = collection(db, 'sessions')
    const q = query(col, where('date', '<=', today))
    const snap = await getDocs(q)
    const data: Session[] = []
    snap.forEach((d) => {
      data.push(parseSessionDoc(d.id, d.data() as Record<string, unknown>))
    })
    const now = Date.now()
    return data
      .filter((s) => s.status === 'confirmed' || s.status === 'done')
      .filter((s) => {
        const end = new Date(`${s.date}T${s.endTime}`)
        return !Number.isNaN(end.getTime()) && end.getTime() <= now
      })
      .sort((a, b) => {
        const d = b.date.localeCompare(a.date)
        return d !== 0 ? d : b.startTime.localeCompare(a.startTime)
      })
  }

  const saveSessionReview = async (
    sessionId: string,
    reviewRating: number,
    reviewNotes: string,
  ) => {
    const db = getDb()
    const user = currentUser.value
    if (!db || !user) throw new Error('Non autorisé')
    const rating = Math.min(5, Math.max(1, Math.round(reviewRating)))
    await updateDoc(doc(db, 'sessions', sessionId), {
      reviewRating: rating,
      reviewNotes: reviewNotes.trim(),
      reviewedBy: user.uid,
    })
  }

  const markSessionReviewSent = async (sessionId: string) => {
    const db = getDb()
    if (!db) return
    await updateDoc(doc(db, 'sessions', sessionId), {
      reviewSentAt: new Date(),
    })
  }

  return {
    sessions,
    loading,
    error,
    groupedByDate,
    listForCurrentBooker,
    listAllUpcoming,
    listForCurrentBeatmaker,
    listForCurrentInge,
    listSessionsForDate,
    findUnpaidByReservationName,
    listAllPending,
    listAllFromDate,
    listSessionsInDateRange,
    bookSession,
    updateSessionStatus,
    updateSessionRecapSent,
    updateSessionFields,
    updateSessionInge,
    updateSessionRemainingToPay,
    listPastSessions,
    saveSessionReview,
    markSessionReviewSent,
  }
}
