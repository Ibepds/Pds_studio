import { Resend } from 'resend'

interface SessionReviewFile {
  fileName: string
  url: string
}

interface SendSessionReviewBody {
  toEmail: string
  session: {
    date: string
    startTime: string
    endTime: string
    reservationName?: string | null
  }
  review: {
    rating: number
    notes: string
  }
  files?: SessionReviewFile[]
}

function formatFrenchDateShort(dateStr: string): string {
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

function starsHtml(rating: number): string {
  const full = Math.min(5, Math.max(1, Math.round(rating)))
  return '★'.repeat(full) + '☆'.repeat(5 - full)
}

async function sendEmail(resendApiKey: string, to: string, subject: string, html: string) {
  if (!resendApiKey) return
  const resend = new Resend(resendApiKey)
  await resend.emails.send({
    from: 'PDS Studio <onboarding@resend.dev>',
    to: [to],
    subject,
    html,
  })
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = (await readBody(event)) as SendSessionReviewBody

  if (!body?.toEmail?.trim()) {
    throw createError({ statusCode: 400, message: 'toEmail requis' })
  }
  if (!body?.session?.date) {
    throw createError({ statusCode: 400, message: 'session requis' })
  }
  const rating = Math.min(5, Math.max(1, Math.round(body.review?.rating ?? 0)))
  if (!rating) {
    throw createError({ statusCode: 400, message: 'review.rating requis (1 à 5)' })
  }

  const s = body.session
  const notes = (body.review?.notes ?? '').trim()
  const dateLabel = formatFrenchDateShort(s.date)
  const hourLabel = formatHourRange(s.startTime, s.endTime)
  const nameLabel = s.reservationName?.trim() || 'ta session'

  const filesList =
    body.files?.length ?
      `<ul>${body.files
        .map(
          (f) =>
            `<li><strong>${f.fileName}</strong> — <a href="${f.url}" target="_blank" rel="noreferrer">écouter / télécharger</a></li>`,
        )
        .join('')}</ul>`
    : '<p>Les pistes de ta session sont disponibles sur ton espace booker.</p>'

  const subject = `[PDS] Ton avis studio — session du ${s.date}`
  const html = `
    <p>Bonjour,</p>
    <p>L’équipe PDS Records a partagé un retour sur <strong>${nameLabel}</strong> (${dateLabel}, ${hourLabel}).</p>
    <p><strong>Note</strong> : ${starsHtml(rating)} (${rating}/5)</p>
    ${
      notes
        ? `<p><strong>Ce qui a été produit</strong></p><p style="white-space:pre-wrap">${notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
        : ''
    }
    <p><strong>Pistes de la session</strong></p>
    ${filesList}
    <p>À bientôt au studio,</p>
    <p>PDS Records — studio@pdsrecords.com</p>
  `

  const resendApiKey = config.resendApiKey as string
  try {
    await sendEmail(resendApiKey, body.toEmail.trim(), subject, html)
  } catch (e) {
    console.error('[send-session-review] Email error', e)
    throw createError({ statusCode: 500, message: 'Erreur envoi email avis session' })
  }

  return { ok: true }
})
