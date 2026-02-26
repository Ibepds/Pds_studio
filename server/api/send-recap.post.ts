/**
 * Envoie le mail de récap au booker après confirmation de la session par l’ingé.
 * Contenu : jour/heure, ce qui a été payé, ce qui reste à payer.
 * L’appelant doit ensuite appeler updateSessionRecapSent(sessionId).
 * Variables d’environnement : RESEND_API_KEY
 */
import { Resend } from 'resend';

interface SendRecapBody {
  session: {
    id: string
    date: string
    startTime: string
    endTime: string
    bookerEmail: string | null
    depositAmount?: number
    totalPrice?: number
    remainingToPay?: number | null
  }
}

function restToPay(s: SendRecapBody['session']): number {
  if (s.remainingToPay !== undefined && s.remainingToPay !== null) return s.remainingToPay
  return Math.max(0, (s.totalPrice ?? 0) - (s.depositAmount ?? 0))
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

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = (await readBody(event)) as SendRecapBody
  if (!body?.session?.bookerEmail) {
    throw createError({ statusCode: 400, message: 'session.bookerEmail requis' })
  }

  const s = body.session
  const rest = restToPay(s)
  const paid = s.depositAmount ?? 0

  const subject = `[PDS] Récap de ta session ${s.date} ${s.startTime}–${s.endTime}`
  const html = `
    <p>Ta session studio PDS a été confirmée.</p>
    <p><strong>Date et horaire</strong> : ${s.date} de ${s.startTime} à ${s.endTime}</p>
    <p><strong>Déjà payé (acompte)</strong> : ${paid}€</p>
    <p><strong>Reste à payer</strong> : ${rest}€</p>
    <p><strong>Total session</strong> : ${s.totalPrice ?? '—'}€</p>
    <p>À bientôt au studio.</p>
  `

  const resendApiKey = config.resendApiKey as string
  try {
    await sendEmail(resendApiKey, s.bookerEmail, subject, html)
  } catch (e) {
    console.error('[send-recap] Email error', e)
    throw createError({ statusCode: 500, message: 'Erreur envoi email récap' })
  }

  return { ok: true }
})
