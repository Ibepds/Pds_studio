/**
 * Notifications à l’admin et aux ingés concernés quand un booker réserve une session.
 * Envoie un email + SMS à chaque destinataire.
 * Variables d’environnement : RESEND_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_PHONE, ADMIN_EMAIL, ADMIN_PHONE
 */
import type { H3Event } from 'h3'

interface NotifyBookingBody {
  session: {
    date: string
    startTime: string
    endTime: string
    bookerEmail?: string | null
    style?: string
    durationHours?: number
    totalPrice?: number
  }
  /** Emails des ingés concernés (créneau dispo) */
  recipientEmails?: string[]
  /** Téléphones des ingés concernés (format E.164) */
  recipientPhones?: string[]
}

async function sendEmail(resendApiKey: string, to: string, subject: string, html: string) {
  if (!resendApiKey) return
  await $fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'PDS Studio <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    }),
  })
}

async function sendSms(
  accountSid: string,
  authToken: string,
  fromPhone: string,
  to: string,
  body: string,
) {
  if (!accountSid || !authToken || !fromPhone) return
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  await $fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: to,
      From: fromPhone,
      Body: body,
    }),
  })
}

export default defineEventHandler(async (event: H3Event) => {
  const config = useRuntimeConfig()
  const body = (await readBody(event)) as NotifyBookingBody
  if (!body?.session) {
    throw createError({ statusCode: 400, message: 'session requise' })
  }

  const s = body.session
  const adminEmail = config.adminEmail as string
  const adminPhone = config.adminPhone as string
  const emails = [...new Set([...(body.recipientEmails ?? []), ...(adminEmail ? [adminEmail] : [])])].filter(Boolean)
  const phones = [...new Set([...(body.recipientPhones ?? []), ...(adminPhone ? [adminPhone] : [])])].filter(Boolean)

  const subject = `[PDS] Nouvelle réservation ${s.date} ${s.startTime}–${s.endTime}`
  const text = `Nouvelle réservation studio PDS.\nDate : ${s.date}\nHoraire : ${s.startTime} – ${s.endTime}\nBooker : ${s.bookerEmail ?? '—'}\nStyle : ${s.style ?? '—'}\nDurée : ${s.durationHours ?? '—'}h\nTotal : ${s.totalPrice ?? '—'}€`
  const html = `<p>${text.replace(/\n/g, '<br>')}</p>`

  const resendApiKey = config.resendApiKey as string
  const twilioSid = config.twilioAccountSid as string
  const twilioToken = config.twilioAuthToken as string
  const twilioFrom = config.twilioFromPhone as string

  for (const email of emails) {
    try {
      await sendEmail(resendApiKey, email, subject, html)
    } catch (e) {
      console.error('[notify-booking] Email error', email, e)
    }
  }
  for (const phone of phones) {
    try {
      await sendSms(twilioSid, twilioToken, twilioFrom, phone, `[PDS] ${subject}\n${text}`)
    } catch (e) {
      console.error('[notify-booking] SMS error', phone, e)
    }
  }

  return { ok: true }
})
