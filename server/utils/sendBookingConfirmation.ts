import { Resend } from 'resend'

export interface BookingConfirmationSession {
  bookerEmail: string
  date: string
  startTime: string
  endTime: string
  durationHours?: number | null
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function sendEmail(resendApiKey: string, to: string, subject: string, html: string) {
  if (!resendApiKey) return
  const resend = new Resend(resendApiKey)
  const send = () =>
    resend.emails.send({
      from: 'PDS Studio <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    })
  let response = await send()
  if ((response as { error?: { statusCode?: number }; headers?: Record<string, string> })?.error?.statusCode === 429) {
    const retryAfter = (response as { headers?: Record<string, string> }).headers?.['retry-after']
    await delay(Math.max(1000, parseInt(retryAfter || '1', 10) * 1000))
    response = await send()
  }
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

export function buildBookingConfirmationHtml(s: BookingConfirmationSession): string {
  const dateLabel = formatFrenchDate(s.date)
  const hourLabel = formatHourRange(s.startTime, s.endTime)
  return `
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
}

/** Envoie l’email de confirmation au booker (après paiement PayPal réussi). */
export async function sendBookingConfirmationEmail(
  resendApiKey: string,
  session: BookingConfirmationSession,
): Promise<void> {
  const email = session.bookerEmail?.trim()
  if (!email) return

  const subject = '[PDS] Confirmation de ta réservation studio'
  const html = buildBookingConfirmationHtml(session)
  await sendEmail(resendApiKey, email, subject, html)
}
