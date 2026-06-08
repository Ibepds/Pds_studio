/**
 * Supprime un événement Google Calendar.
 * Appelé quand l'admin annule une session depuis la modal du calendrier.
 *
 * Body : { eventId }
 */
import { google } from 'googleapis'

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

  const body = (await readBody(event)) as { eventId: string }
  if (!body?.eventId) {
    throw createError({ statusCode: 400, message: 'eventId requis' })
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth })
    await calendar.events.delete({ calendarId, eventId: body.eventId })
    return { ok: true }
  } catch (e: any) {
    // 410 Gone = déjà supprimé, on ignore
    if (e?.code === 410 || e?.status === 410) return { ok: true, alreadyDeleted: true }
    console.error('[google-calendar-event DELETE]', e)
    throw createError({ statusCode: 500, message: 'Erreur suppression événement Google Calendar' })
  }
})
