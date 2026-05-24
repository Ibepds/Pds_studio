/**
 * Notifications manuelles (admin). Le flux normal passe par capture PayPal → postPaymentNotifications.
 */
import { sendBookingNotifyEmails } from '../utils/notifyBooking'

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
  recipientEmails?: string[]
  recipientPhones?: string[]
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = (await readBody(event)) as NotifyBookingBody
  if (!body?.session) {
    throw createError({ statusCode: 400, message: 'session requise' })
  }

  await sendBookingNotifyEmails(
    config,
    body.session,
    body.recipientEmails ?? [],
    body.recipientPhones ?? [],
  )

  return { ok: true }
})
