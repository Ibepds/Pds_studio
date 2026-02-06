import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  getFirestore,
} from 'firebase/firestore'
import { getApps, initializeApp } from 'firebase/app'
import { SLOT_START_HOUR, SLOT_END_HOUR } from '../utils/pricing'
import { useAuth } from './useAuth'

export interface TimeSlot {
  start: string // "HH:mm"
  end: string
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

function docId(userId: string, date: string) {
  return `${userId}_${date}`
}

/** Parse "HH:mm" to minutes since midnight */
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function fromMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/** Intersect two ranges; returns one range or null */
function intersectRange(
  a: { start: string; end: string },
  b: { start: string; end: string },
): { start: string; end: string } | null {
  const a0 = toMinutes(a.start)
  const a1 = toMinutes(a.end)
  const b0 = toMinutes(b.start)
  const b1 = toMinutes(b.end)
  const start = Math.max(a0, b0)
  const end = Math.min(a1, b1)
  if (start >= end) return null
  return { start: fromMinutes(start), end: fromMinutes(end) }
}

/** Intersect multiple lists of slots; returns slots where all have availability */
export function intersectSlots(slotsPerUser: TimeSlot[][]): TimeSlot[] {
  if (slotsPerUser.length === 0) return []
  if (slotsPerUser.length === 1) return slotsPerUser[0] ?? []
  let result: TimeSlot[] = slotsPerUser[0] ?? []
  for (let i = 1; i < slotsPerUser.length; i++) {
    const next = slotsPerUser[i] ?? []
    const merged: TimeSlot[] = []
    for (const r of result) {
      for (const s of next) {
        const inter = intersectRange(r, s)
        if (inter) merged.push(inter)
      }
    }
    result = merged
  }
  return result
}

/** From overlapping slots and duration (hours), return possible start hours (e.g. [10, 11, 12]) */
export function getStartHoursFromSlots(slots: TimeSlot[], durationHours: number): number[] {
  const hours: number[] = []
  const durationMin = durationHours * 60
  for (let h = SLOT_START_HOUR; h <= SLOT_END_HOUR - durationHours; h++) {
    const startMin = h * 60
    const endMin = startMin + durationMin
    const fits = slots.some((s) => {
      const s0 = toMinutes(s.start)
      const s1 = toMinutes(s.end)
      return startMin >= s0 && endMin <= s1
    })
    if (fits) hours.push(h)
  }
  return hours
}

/** Session block: { date, startTime, endTime } to exclude from availability */
export interface SessionBlock {
  date: string
  startTime: string
  endTime: string
}

/** Remove start hours that would overlap with any of the given sessions on the same date */
export function filterOutBookedSlots(
  startHours: number[],
  date: string,
  durationHours: number,
  booked: SessionBlock[],
): number[] {
  const dayBlocks = booked.filter((b) => b.date === date)
  if (dayBlocks.length === 0) return startHours
  return startHours.filter((h) => {
    const startMin = h * 60
    const endMin = startMin + durationHours * 60
    const conflicts = dayBlocks.some((b) => {
      const b0 = toMinutes(b.startTime)
      const b1 = toMinutes(b.endTime)
      return startMin < b1 && endMin > b0
    })
    return !conflicts
  })
}

export const useAvailability = () => {
  const { currentUser } = useAuth()
  const loading = ref(false)
  const error = ref<string | null>(null)

  const setSlotsForDate = async (
    date: string,
    slots: TimeSlot[],
    role: 'inge' | 'beatmaker',
  ) => {
    const db = getDb()
    const user = currentUser.value
    if (!db || !user) throw new Error('Non connecté')

    const id = docId(user.uid, date)
    const ref = doc(db, 'availability', id)
    if (slots.length === 0) {
      await setDoc(ref, { userId: user.uid, date, role, slots: [] })
    } else {
      await setDoc(ref, { userId: user.uid, date, role, slots })
    }
  }

  const getMySlotsForDate = async (date: string): Promise<TimeSlot[]> => {
    const db = getDb()
    const user = currentUser.value
    if (!db || !user) return []

    const ref = doc(db, 'availability', docId(user.uid, date))
    const snap = await getDoc(ref)
    if (!snap.exists()) return []
    const data = snap.data() as { slots?: TimeSlot[] }
    return data.slots ?? []
  }

  /** List all my availability docs (for calendar display) */
  const listMyAvailability = async (): Promise<{ date: string; slots: TimeSlot[] }[]> => {
    const db = getDb()
    const user = currentUser.value
    if (!db || !user) return []

    loading.value = true
    error.value = null
    try {
      const col = collection(db, 'availability')
      const q = query(col, where('userId', '==', user.uid))
      const snap = await getDocs(q)
      const out: { date: string; slots: TimeSlot[] }[] = []
      snap.forEach((d) => {
        const data = d.data() as { date: string; slots?: TimeSlot[] }
        out.push({ date: data.date, slots: data.slots ?? [] })
      })
      out.sort((a, b) => a.date.localeCompare(b.date))
      return out
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur chargement disponibilités'
      return []
    } finally {
      loading.value = false
    }
  }

  /** Get slots for several users on one date (for Booker: intersection) */
  const getSlotsForUsersOnDate = async (
    userIds: string[],
    date: string,
  ): Promise<Map<string, TimeSlot[]>> => {
    const db = getDb()
    if (!db || userIds.length === 0) return new Map()

    const map = new Map<string, TimeSlot[]>()
    await Promise.all(
      userIds.map(async (uid) => {
        const ref = doc(db, 'availability', docId(uid, date))
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          map.set(uid, [])
          return
        }
        const data = snap.data() as { slots?: TimeSlot[] }
        map.set(uid, data.slots ?? [])
      }),
    )
    return map
  }

  /** Which dates in the given month have availability for ALL given users (intersection) */
  const getAvailableDatesForUsers = async (
    userIds: string[],
    year: number,
    month: number,
  ): Promise<string[]> => {
    if (userIds.length === 0) return []
    const db = getDb()
    if (!db) return []

    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDayNum = new Date(year, month + 1, 0).getDate()
    const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`
    const today = new Date().toISOString().slice(0, 10)

    const byDate = new Map<string, TimeSlot[][]>()
    for (const uid of userIds) {
      const col = collection(db, 'availability')
      const q = query(
        col,
        where('userId', '==', uid),
        where('date', '>=', firstDay),
        where('date', '<=', lastDay),
      )
      const snap = await getDocs(q)
      snap.forEach((d) => {
        const data = d.data() as { date: string; slots?: TimeSlot[] }
        const dateStr = data.date
        const slots = data.slots ?? []
        if (slots.length === 0) return
        if (!byDate.has(dateStr)) byDate.set(dateStr, [])
        byDate.get(dateStr)!.push(slots)
      })
    }

    const availableDates: string[] = []
    for (let day = 1; day <= lastDayNum; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (dateStr < today) continue
      const slotsPerUser = byDate.get(dateStr)
      if (!slotsPerUser || slotsPerUser.length !== userIds.length) continue
      const intersection = intersectSlots(slotsPerUser)
      if (intersection.length > 0) availableDates.push(dateStr)
    }
    return availableDates.sort()
  }

  return {
    setSlotsForDate,
    getMySlotsForDate,
    listMyAvailability,
    getSlotsForUsersOnDate,
    getAvailableDatesForUsers,
    loading,
    error,
  }
}
