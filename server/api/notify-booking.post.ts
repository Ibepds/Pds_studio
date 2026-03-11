/**
 * Notifications à l’admin et aux ingés concernés quand un booker réserve une session.
 * Envoie un email + SMS à chaque destinataire.
 * Variables d’environnement : RESEND_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_PHONE, ADMIN_EMAIL, ADMIN_PHONE
 */
import type { H3Event } from 'h3'
import { Resend } from 'resend'

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
  return response
}

async function sendSms(
  accountSid: string,
  authToken: string,
  fromPhone: string,
  to: string,
  body: string,
) {
  const config = useRuntimeConfig()
  if (!accountSid || !authToken || !fromPhone || !config.twilioServiceSid) return
  const twilio = require('twilio')
  const client = twilio(accountSid, authToken)

  const service = await client.messaging.v1.services(config.twilioServiceSid as string).fetch()

  console.log(service.sid)

  const message = await service.sendMessage({
    body: body,
    messagingServiceSid: service.sid,
    from: fromPhone,
    to: to,
  })
  console.log(message)
  return message.sid
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
  const emails = [
    ...new Set([...(body.recipientEmails ?? []), ...(adminEmail ? [adminEmail] : [])]),
  ].filter(Boolean)
  const phones = [
    ...new Set([...(body.recipientPhones ?? []), ...(adminPhone ? [adminPhone] : [])]),
  ].filter(Boolean)

  const subject = `[PDS] Nouvelle réservation ${s.date} ${s.startTime}–${s.endTime}`
  const text = `Nouvelle réservation studio PDS.\nDate : ${s.date}\nHoraire : ${s.startTime} – ${s.endTime}\nBooker : ${s.bookerEmail ?? '—'}\nStyle : ${s.style ?? '—'}\nDurée : ${s.durationHours ?? '—'}h\nTotal : ${s.totalPrice ?? '—'}€`
  const html = `<p>${text.replace(/\n/g, '<br>')}</p>`

  const resendApiKey = config.resendApiKey as string
  const twilioSid = config.twilioAccountSid as string
  const twilioToken = config.twilioAuthToken as string
  const twilioFrom = config.twilioFromPhone as string

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i]
    if (!email) continue
    try {
      if (i > 0) await delay(600)
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
