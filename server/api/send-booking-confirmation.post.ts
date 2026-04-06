import { Resend } from 'resend'

interface BookingConfirmationSession {
  bookerEmail: string
  date: string
  startTime: string
  endTime: string
  durationHours?: number | null
}

interface BookingConfirmationBody {
  session: BookingConfirmationSession
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Resend allows 2 requests/second; wait and retry once on 429. */
async function sendEmail(resendApiKey: string, to: string, subject: string, html: string) {
  if (!resendApiKey) return
  const resend = new Resend(resendApiKey)
  const send = () =>
    resend.emails.send({
      from: 'PDS Studio <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html,
    })
  let response = await send()
  if ((response as { error?: { statusCode?: number }; headers?: Record<string, string> })?.error?.statusCode === 429) {
    const retryAfter = (response as { headers?: Record<string, string> }).headers?.['retry-after']
    await delay(Math.max(1000, parseInt(retryAfter || '1', 10) * 1000))
    response = await send()
  }
  console.log('Booking confirmation response', response)
  return response
}

function formatFrenchDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`)
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatHourRange(start: string, end: string): string {
  const fmt = (t: string) => t.replace(':00', 'h').replace(':', 'h')
  return `${fmt(start)}-${fmt(end)}`
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = (await readBody(event)) as BookingConfirmationBody

  if (!body?.session?.bookerEmail) {
    throw createError({ statusCode: 400, message: 'session.bookerEmail requis' })
  }

  const s = body.session
  console.log('Booking confirmation', s)
  console.log('Booking confirmation date', s.date)
  console.log('Booking confirmation startTime', s.startTime)
  console.log('Booking confirmation endTime', s.endTime)
  const dateLabel = formatFrenchDate(s.date)
  const hourLabel = formatHourRange(s.startTime, s.endTime)

  const subject = '[PDS] Confirmation de ta réservation studio'
  const html = `
    <p>Ok, ta réservation au studio PDS est confirmée.</p>
    <p><strong>📍 Adresse</strong> : 13 rue de Vanves, 92100 Boulogne-Billancourt</p>
    <p><strong>🗓 Date</strong> : ${dateLabel}</p>
    <p><strong>🕒 Heure</strong> : ${hourLabel}</p>
    <p><strong>👥 Nombre de personnes autorisées</strong> : 4 maximum</p>
    <p>🚭 Le studio est strictement non-fumeur. Un espace extérieur est mis à disposition si nécessaire.</p>
    <p>Veuillez respecter l'horaire afin de garantir le bon déroulement de votre séance.</p>
    <p>Pour toute question ou information complémentaire, nous restons disponibles par retour de mail.</p>
    <p><strong>Conditions d'annulation :</strong></p>
    <ul>
      <li>L'acompte n'est pas remboursable en cas d'annulation moins de 48 heures avant la séance.</li>
      <li>Pour toute annulation effectuée plus de 48 heures avant, l'acompte pourra être reporté sur une autre date.</li>
    </ul>
    <p>L'équipe PDS Records</p>
  `

  const resendApiKey = config.resendApiKey as string

  try {
    await sendEmail(resendApiKey, s.bookerEmail, subject, html)
  } catch (e) {
    console.error('[send-booking-confirmation] Email error', e)
    throw createError({ statusCode: 500, message: 'Erreur envoi email confirmation' })
  }

  return { ok: true }
})
