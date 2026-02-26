import { Resend } from 'resend';

interface SendSessionFileBody {
  toEmail: string
  session: {
    date: string
    startTime: string
    endTime: string
  }
  file: {
    fileName: string
    url: string
  }
}

async function sendEmail(resendApiKey: string, to: string, subject: string, html: string) {
  if (!resendApiKey) return
  const resend = new Resend(resendApiKey);
  const response = await resend.emails.send({
    from: 'PDS Studio <onboarding@resend.dev>',
    to: [to],
    subject: subject,
    html: html,
  });
  return response;
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

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = (await readBody(event)) as SendSessionFileBody

  if (!body?.toEmail) {
    throw createError({ statusCode: 400, message: 'toEmail requis' })
  }

  const s = body.session
  const f = body.file

  const dateLabel = formatFrenchDateShort(s.date)
  const hourLabel = formatHourRange(s.startTime, s.endTime)

  const subject = `[PDS] Nouvelle piste pour ta session du ${s.date} ${s.startTime}–${s.endTime}`
  const html = `
    <p>Une nouvelle piste vient d’être déposée par l’ingé son pour ta session au studio PDS.</p>
    <p><strong>Session</strong> : ${dateLabel} • ${hourLabel}</p>
    <p><strong>Fichier</strong> : ${f.fileName}</p>
    <p><strong>Lien de téléchargement</strong> : <a href="${f.url}" target="_blank" rel="noreferrer">${f.url}</a></p>
    <p>Bonne écoute,</p>
    <p>L’équipe PDS Records</p>
  `

  const resendApiKey = config.resendApiKey as string

  try {
    await sendEmail(resendApiKey, body.toEmail, subject, html)
  } catch (e) {
    console.error('[send-session-file] Email error', e)
    throw createError({ statusCode: 500, message: 'Erreur envoi email piste session' })
  }

  return { ok: true }
})

