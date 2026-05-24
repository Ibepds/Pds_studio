/**
 * Capture une commande PayPal côté serveur, vérifie le montant, met la session en `pending`,
 * puis envoie tous les emails / SMS (booker + ingés + admin).
 */
import {
  assertCapturedAmountMatches,
  capturePaypalOrder,
  getPaypalAccessToken,
  resolvePaypalMode,
} from '../../utils/paypal'
import {
  expectedDepositForRecord,
  getSessionRecord,
  markSessionPaidAfterPaypal,
} from '../../utils/firebaseAdmin'
import { sendPostPaymentNotifications } from '../../utils/postPaymentNotifications'

interface CaptureOrderBody {
  sessionId?: string
  orderId?: string
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const clientId = (config.public.paypalClientId as string)?.trim()
  const clientSecret = (config.paypalClientSecret as string)?.trim()

  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 503,
      message:
        'PayPal serveur non configuré : définir NUXT_PUBLIC_PAYPAL_CLIENT_ID et PAYPAL_CLIENT_SECRET.',
    })
  }

  const body = (await readBody(event)) as CaptureOrderBody
  const sessionId = body?.sessionId?.trim()
  const orderId = body?.orderId?.trim()

  if (!sessionId || !orderId) {
    throw createError({
      statusCode: 400,
      message: 'sessionId et orderId sont requis.',
    })
  }

  const session = await getSessionRecord(sessionId)
  if (!session) {
    throw createError({ statusCode: 404, message: 'Session introuvable.' })
  }

  if (session.status === 'pending' && session.paypalOrderId === orderId) {
    await sendPostPaymentNotifications(config, session)
    return { ok: true, sessionId, orderId, alreadyPaid: true }
  }

  if (session.status !== 'waiting_payment') {
    throw createError({
      statusCode: 409,
      message: `Paiement impossible : statut session « ${session.status} ».`,
    })
  }

  const expectedDeposit = expectedDepositForRecord(session)
  const mode = resolvePaypalMode({
    paypalMode: config.paypalMode as string,
    paypalClientId: clientId,
  })

  const accessToken = await getPaypalAccessToken(clientId, clientSecret, mode)
  const capture = await capturePaypalOrder(orderId, accessToken, mode)

  if (capture.customId && capture.customId !== sessionId) {
    throw createError({
      statusCode: 400,
      message: 'La commande PayPal ne correspond pas à cette réservation.',
    })
  }

  assertCapturedAmountMatches(capture.amountValue, expectedDeposit, capture.currency)
  await markSessionPaidAfterPaypal(sessionId, orderId)

  const paidSession = (await getSessionRecord(sessionId)) ?? session
  await sendPostPaymentNotifications(config, paidSession)

  return {
    ok: true,
    sessionId,
    orderId,
    captureId: capture.id,
    amount: capture.amountValue,
  }
})
