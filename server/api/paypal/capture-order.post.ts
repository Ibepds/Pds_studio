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

  console.log('[PDS PayPal] capture-order → début')

  if (!clientId || !clientSecret) {
    const missing: string[] = []
    if (!clientId) missing.push('NUXT_PUBLIC_PAYPAL_CLIENT_ID')
    if (!clientSecret) missing.push('PAYPAL_CLIENT_SECRET')
    throw createError({
      statusCode: 503,
      message: `PayPal serveur non configuré : ajouter ${missing.join(' et ')} dans .env puis redémarrer \`npm run dev\`.`,
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

  console.log('[PDS PayPal] capture-order params', { sessionId, orderId })

  try {
    const session = await getSessionRecord(sessionId)
    if (!session) {
      throw createError({ statusCode: 404, message: 'Session introuvable.' })
    }

    console.log('[PDS PayPal] capture-order session', {
      status: session.status,
      paypalOrderId: session.paypalOrderId,
    })

    if (session.status === 'pending' && session.paypalOrderId === orderId) {
      console.log('[PDS PayPal] capture-order déjà payée (idempotent)')
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

    console.log('[PDS PayPal] capture-order PayPal', { mode, expectedDeposit })

    const accessToken = await getPaypalAccessToken(clientId, clientSecret, mode)
    const capture = await capturePaypalOrder(orderId, accessToken, mode)

    console.log('[PDS PayPal] capture-order PayPal réponse', {
      captureId: capture.id,
      amount: capture.amountValue,
      currency: capture.currency,
      customId: capture.customId,
    })

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

    console.log('[PDS PayPal] capture-order ← succès')

    return {
      ok: true,
      sessionId,
      orderId,
      captureId: capture.id,
      amount: capture.amountValue,
    }
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string }
    console.error('[PDS PayPal] capture-order ← échec', {
      statusCode: err?.statusCode,
      message: err?.message ?? String(e),
    })
    throw e
  }
})
