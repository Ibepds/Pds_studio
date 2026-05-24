import { resolveBookingNotifyRecipients } from './bookingNotifyRecipients'
import type { SessionRecord } from './firebaseAdmin'
import {
  markBookingConfirmationSent,
  markBookingNotified,
} from './firebaseAdmin'
import { sendBookingNotifyEmails } from './notifyBooking'
import { sendBookingConfirmationEmail } from './sendBookingConfirmation'

/** Emails + SMS ingés/admin + confirmation booker — uniquement après paiement PayPal. */
export async function sendPostPaymentNotifications(
  config: ReturnType<typeof useRuntimeConfig>,
  session: SessionRecord,
): Promise<void> {
  if (!session) return

  await trySendBookingNotify(config, session)
  await trySendBookingConfirmation(config, session)
}

async function trySendBookingNotify(
  config: ReturnType<typeof useRuntimeConfig>,
  session: SessionRecord,
) {
  if (session.bookingNotifiedAt) return
  if (!session.date || !session.startTime || !session.endTime) return

  try {
    const { emails, phones } = await resolveBookingNotifyRecipients(session)
    await sendBookingNotifyEmails(
      config,
      {
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        bookerEmail: session.bookerEmail,
        style: session.style,
        durationHours: session.durationHours ?? null,
        totalPrice: session.totalPrice ?? null,
      },
      emails,
      phones,
    )
    await markBookingNotified(session.id)
  } catch (e) {
    console.error('[post-payment] Notify booking failed', e)
  }
}

async function trySendBookingConfirmation(
  config: ReturnType<typeof useRuntimeConfig>,
  session: SessionRecord,
) {
  if (session.bookingConfirmationSentAt) return

  const email = session.bookerEmail?.trim()
  if (!email || !session.date || !session.startTime || !session.endTime) return

  const resendApiKey = config.resendApiKey as string
  if (!resendApiKey) return

  try {
    await sendBookingConfirmationEmail(resendApiKey, {
      bookerEmail: email,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      durationHours: session.durationHours ?? null,
    })
    await markBookingConfirmationSent(session.id)
  } catch (e) {
    console.error('[post-payment] Booking confirmation email failed', e)
  }
}
