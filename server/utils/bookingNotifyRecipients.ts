import { slotOverlapsAny, type TimeSlot } from '../../utils/timeSlots'
import type { SessionRecord } from './firebaseAdmin'
import { getFirebaseAdminFirestore } from './firebaseAdmin'

function normalizeSlots(raw: unknown[]): TimeSlot[] {
  const slots: TimeSlot[] = []
  for (const item of raw) {
    const s = item as { start?: string; end?: string }
    if (!s?.start || !s?.end) continue
    slots.push({ start: String(s.start).trim(), end: String(s.end).trim() })
  }
  return slots
}

/** Ingés / beatmakers concernés par le créneau (hors leurs indisponibilités déclarées). */
export async function resolveBookingNotifyRecipients(
  session: SessionRecord,
): Promise<{ emails: string[]; phones: string[] }> {
  const db = getFirebaseAdminFirestore()
  if (!db || !session.date || !session.startTime || !session.endTime) {
    return { emails: [], phones: [] }
  }

  const role = session.beatmakerId ? 'beatmaker' : 'inge'
  const usersSnap = await db.collection('users').where('role', '==', role).get()
  if (usersSnap.empty) return { emails: [], phones: [] }

  const sessionSlot: TimeSlot = { start: session.startTime, end: session.endTime }
  const emails: string[] = []
  const phones: string[] = []

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id
    const data = userDoc.data() as { email?: string; phone?: string }
    const availSnap = await db.collection('availability').doc(`${uid}_${session.date}`).get()
    const unavail = availSnap.exists
      ? normalizeSlots((availSnap.data()?.slots as unknown[]) ?? [])
      : []
    if (slotOverlapsAny(sessionSlot, unavail)) continue
    if (data.email) emails.push(data.email)
    if (data.phone) phones.push(data.phone)
  }

  return { emails, phones }
}
