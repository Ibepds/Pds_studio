/**
 * Notifications admin + ingés/beatmakers après réservation payée.
 */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function sendEmail(resendApiKey: string, to: string, subject: string, html: string) {
  if (!resendApiKey) return
  const { Resend } = await import('resend')
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

async function sendSms(
  accountSid: string,
  authToken: string,
  fromPhone: string,
  twilioServiceSid: string,
  to: string,
  body: string,
) {
  if (!accountSid || !authToken || !fromPhone || !twilioServiceSid) return
  const twilio = (await import('twilio')).default
  const client = twilio(accountSid, authToken)
  const service = await client.messaging.v1.services(twilioServiceSid).fetch()
  await service.sendMessage({
    body,
    messagingServiceSid: service.sid,
    from: fromPhone,
    to,
  })
}

export interface NotifyBookingSession {
  date: string
  startTime: string
  endTime: string
  bookerEmail?: string | null
  style?: string
  durationHours?: number | null
  totalPrice?: number | null
}

export async function sendBookingNotifyEmails(
  config: ReturnType<typeof useRuntimeConfig>,
  session: NotifyBookingSession,
  recipientEmails: string[],
  recipientPhones: string[],
): Promise<void> {
  const adminEmail = config.adminEmail as string
  const adminPhone = config.adminPhone as string
  const emails = [...new Set([...recipientEmails, ...(adminEmail ? [adminEmail] : [])])].filter(Boolean)
  const phones = [...new Set([...recipientPhones, ...(adminPhone ? [adminPhone] : [])])].filter(Boolean)

  const subject = `[PDS] Nouvelle réservation ${session.date} ${session.startTime}–${session.endTime}`
  const text = `Nouvelle réservation studio PDS.\nDate : ${session.date}\nHoraire : ${session.startTime} – ${session.endTime}\nBooker : ${session.bookerEmail ?? '—'}\nStyle : ${session.style ?? '—'}\nDurée : ${session.durationHours ?? '—'}h\nTotal : ${session.totalPrice ?? '—'}€`
  const html = `<p>${text.replace(/\n/g, '<br>')}</p>`

  const resendApiKey = config.resendApiKey as string
  const twilioSid = config.twilioAccountSid as string
  const twilioToken = config.twilioAuthToken as string
  const twilioFrom = config.twilioFromPhone as string
  const twilioServiceSid = config.twilioServiceSid as string

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
      await sendSms(twilioSid, twilioToken, twilioFrom, twilioServiceSid, phone, `[PDS] ${subject}\n${text}`)
    } catch (e) {
      console.error('[notify-booking] SMS error', phone, e)
    }
  }
}
