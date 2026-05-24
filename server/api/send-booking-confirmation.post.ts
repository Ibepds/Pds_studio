import { sendBookingConfirmationEmail } from '../utils/sendBookingConfirmation'

interface BookingConfirmationBody {
  session: {
    bookerEmail: string
    date: string
    startTime: string
    endTime: string
    durationHours?: number | null
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = (await readBody(event)) as BookingConfirmationBody

  if (!body?.session?.bookerEmail) {
    throw createError({ statusCode: 400, message: 'session.bookerEmail requis' })
  }

  const resendApiKey = config.resendApiKey as string

  try {
    await sendBookingConfirmationEmail(resendApiKey, body.session)
  } catch (e) {
    console.error('[send-booking-confirmation] Email error', e)
    throw createError({ statusCode: 500, message: 'Erreur envoi email confirmation' })
  }

  return { ok: true }
})
