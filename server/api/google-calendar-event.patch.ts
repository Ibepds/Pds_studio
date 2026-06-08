/**
 * Met à jour un événement Google Calendar existant (date/heure/titre).
 * Appelé quand l'admin modifie une session depuis la modal du calendrier.
 *
 * Body : { eventId, session: { date, startTime, endTime, bookerEmail?, style? } }
 */
import { google } from 'googleapis'

interface PatchBody {
  eventId: string
  session: {
    date: string
    startTime: string
    endTime: string
    bookerEmail?: string | null
    style?: string
  }
}

function getCalendarAuth(config: ReturnType<typeof useRuntimeConfig>) {
  const keyFile = (config.googleApplicationCredentials as string)?.trim()
  const email = (config.googleServiceAccountEmail as string)?.trim()
  const privateKey = (config.googleServiceAccountPrivateKey as string)?.trim()

  if (keyFile) {
    return new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    })
  }
  if (email && privateKey) {
    const key = privateKey.replace(/\\n/g, '\n')
    return new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: key },
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    })
  }
  return null
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const calendarId = ((config.googleCalendarId as string) || 'primary').trim()
  const auth = getCalendarAuth(config)

  if (!auth) {
    return { ok: false, skipped: true, message: 'Google Calendar non configuré' }
  }

  const body = (await readBody(event)) as PatchBody
  if (!body?.eventId || !body?.session?.date) {
    throw createError({ statusCode: 400, message: 'eventId et session.date requis' })
  }

  const s = body.session
  const [startH, startM] = (s.startTime || '10:00').split(':').map(Number)
  const [endH, endM] = (s.endTime || '12:00').split(':').map(Number)
  const start = new Date(
    `${s.date}T${String(startH).padStart(2, '0')}:${String(startM || 0).padStart(2, '0')}:00`,
  )
  const end = new Date(
    `${s.date}T${String(endH).padStart(2, '0')}:${String(endM || 0).padStart(2, '0')}:00`,
  )

  const summary = `Session PDS ${s.bookerEmail ?? 'Booker'}`
  const description = [s.style && `Style: ${s.style}`, s.bookerEmail && `Booker: ${s.bookerEmail}`]
    .filter(Boolean)
    .join('\n')

  try {
    const calendar = google.calendar({ version: 'v3', auth })
    await calendar.events.patch({
      calendarId,
      eventId: body.eventId,
      requestBody: {
        summary,
        description: description || undefined,
        start: { dateTime: start.toISOString(), timeZone: 'Europe/Paris' },
        end: { dateTime: end.toISOString(), timeZone: 'Europe/Paris' },
      },
    })
    return { ok: true }
  } catch (e) {
    console.error('[google-calendar-event PATCH]', e)
    throw createError({ statusCode: 500, message: 'Erreur mise à jour événement Google Calendar' })
  }
})
