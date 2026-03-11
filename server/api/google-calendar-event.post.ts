/**
 * Crée un événement sur un Google Calendar quand une session est confirmée.
 * Utilise le client officiel Google APIs Node.js avec un Service Account (pas de refresh token).
 *
 * Config (au choix) :
 *   A) GOOGLE_APPLICATION_CREDENTIALS = chemin vers le fichier JSON du compte de service
 *   B) GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (clé privée en base64 ou avec \n)
 *   + GOOGLE_CALENDAR_ID = ID de l’agenda (partagé avec l’email du compte de service)
 *
 * Dans Google Cloud : créer un compte de service, télécharger le JSON.
 * Dans Google Calendar : partager l’agenda cible avec l’email du compte de service (« Gérer les événements »).
 */
import { google } from 'googleapis'

interface CalendarEventBody {
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
    return {
      ok: false,
      skipped: true,
      message:
        'Google Calendar non configuré : définir GOOGLE_APPLICATION_CREDENTIALS ou GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    }
  }

  const body = (await readBody(event)) as CalendarEventBody
  if (!body?.session?.date) {
    throw createError({ statusCode: 400, message: 'session.date requise' })
  }

  const s = body.session
  const [startH, startM] = (s.startTime || '10:00').split(':').map(Number)
  const [endH, endM] = (s.endTime || '12:00').split(':').map(Number)
  const dateStr = s.date
  const start = new Date(
    `${dateStr}T${String(startH).padStart(2, '0')}:${String(startM || 0).padStart(2, '0')}:00`,
  )
  const end = new Date(
    `${dateStr}T${String(endH).padStart(2, '0')}:${String(endM || 0).padStart(2, '0')}:00`,
  )

  const summary = `Session PDS ${s.bookerEmail ?? 'Booker'}`
  const description = [s.style && `Style: ${s.style}`, s.bookerEmail && `Booker: ${s.bookerEmail}`]
    .filter(Boolean)
    .join('\n')

  try {
    const calendar = google.calendar({ version: 'v3', auth })

    await calendar.events.insert({
      calendarId,
      requestBody: {
        summary,
        description: description || undefined,
        start: { dateTime: start.toISOString(), timeZone: 'Europe/Paris' },
        end: { dateTime: end.toISOString(), timeZone: 'Europe/Paris' },
      },
    })

    return { ok: true }
  } catch (e) {
    console.error('[google-calendar-event]', e)
    throw createError({ statusCode: 500, message: 'Erreur création événement Google Calendar' })
  }
})
