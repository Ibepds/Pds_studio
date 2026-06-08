/**
 * Capture une commande PayPal côté serveur, vérifie le montant, met la session en `pending`,
 * puis envoie tous les emails / SMS (booker + ingés + admin).
 */
import {
  assertCapturedAmountMatches,
  capturePaypalOrder,
  getPaypalAccessToken,
} from '../../utils/paypal'
import {
  expectedDepositForRecord,
  getSessionRecord,
  markSessionPaidAfterPaypal,
} from '../../utils/firebaseAdmin'
import { sendPostPaymentNotifications } from '../../utils/postPaymentNotifications'
import { getPaypalServerConfig, paypalConfigDiagnostics } from '../../utils/paypalConfig'
import { firebaseAdminUserMessage } from '../../../utils/firestoreErrors'
import { paypalUserMessage } from '../../../utils/paypalErrors'

interface CaptureOrderBody {
  sessionId?: string
  orderId?: string
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const { clientId, clientSecret, mode } = getPaypalServerConfig(config)

  console.log('[PDS PayPal] capture-order → début', paypalConfigDiagnostics(config))

  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 503,
      message: paypalUserMessage.notConfigured,
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
      throw createError({ statusCode: 404, message: firebaseAdminUserMessage.sessionNotFound })
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
        message: firebaseAdminUserMessage.sessionNotPayable(session.status),
      })
    }

    const expectedDeposit = expectedDepositForRecord(session)

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
