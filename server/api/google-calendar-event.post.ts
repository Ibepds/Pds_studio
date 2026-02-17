/**
 * Crée un événement sur un Google Calendar (agenda) quand une session est confirmée.
 * Config : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID (optionnel, défaut "primary")
 * Pour obtenir le refresh token : flux OAuth2 "offline" avec scope https://www.googleapis.com/auth/calendar.events
 */
interface CalendarEventBody {
  session: {
    date: string
    startTime: string
    endTime: string
    bookerEmail?: string | null
    style?: string
  }
}

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await $fetch<{ access_token: string }>('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  return res.access_token
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const clientId = config.googleClientId as string
  const clientSecret = config.googleClientSecret as string
  const refreshToken = config.googleRefreshToken as string
  const calendarId = config.googleCalendarId as string
  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, skipped: true, message: 'Google Calendar non configuré' }
  }

  const body = (await readBody(event)) as CalendarEventBody
  if (!body?.session?.date) {
    throw createError({ statusCode: 400, message: 'session.date requise' })
  }

  const s = body.session
  const [startH, startM] = (s.startTime || '10:00').split(':').map(Number)
  const [endH, endM] = (s.endTime || '12:00').split(':').map(Number)
  const dateStr = s.date
  const start = new Date(`${dateStr}T${String(startH).padStart(2, '0')}:${String(startM || 0).padStart(2, '0')}:00`)
  const end = new Date(`${dateStr}T${String(endH).padStart(2, '0')}:${String(endM || 0).padStart(2, '0')}:00`)

  const summary = `Session PDS ${s.bookerEmail ?? 'Booker'}`
  const description = [s.style && `Style: ${s.style}`, s.bookerEmail && `Booker: ${s.bookerEmail}`].filter(Boolean).join('\n')

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken)
    await $fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary,
          description: description || undefined,
          start: { dateTime: start.toISOString(), timeZone: 'Europe/Paris' },
          end: { dateTime: end.toISOString(), timeZone: 'Europe/Paris' },
        }),
      },
    )
    return { ok: true }
  } catch (e) {
    console.error('[google-calendar-event]', e)
    throw createError({ statusCode: 500, message: 'Erreur création événement Google Calendar' })
  }
})
