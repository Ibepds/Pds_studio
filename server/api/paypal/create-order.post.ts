/**
 * Crée une commande PayPal côté serveur (Orders v2) pour le SDK v6.
 */
import {
  createPaypalOrder,
  getPaypalAccessToken,
} from '../../utils/paypal'
import {
  expectedDepositForRecord,
  getSessionRecord,
} from '../../utils/firebaseAdmin'
import { getPaypalServerConfig, paypalConfigDiagnostics } from '../../utils/paypalConfig'
import { firebaseAdminUserMessage } from '../../../utils/firestoreErrors'
import { paypalUserMessage } from '../../../utils/paypalErrors'

interface CreateOrderBody {
  sessionId?: string
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const { clientId, clientSecret, mode } = getPaypalServerConfig(config)

  console.log('[PDS PayPal] create-order → début', paypalConfigDiagnostics(config))

  if (!clientId || !clientSecret) {
    console.error('[PDS PayPal] create-order config manquante', paypalConfigDiagnostics(config))
    throw createError({
      statusCode: 503,
      message: paypalUserMessage.notConfigured,
    })
  }

  const publicMode = ((config.public.paypalMode as string) || '').trim().toLowerCase()
  if (publicMode && publicMode !== mode) {
    console.warn('[PDS PayPal] create-order mode client ≠ serveur', {
      publicMode,
      serverMode: mode,
    })
  }

  try {
    const body = (await readBody(event)) as CreateOrderBody
    const sessionId = body?.sessionId?.trim()
    if (!sessionId) {
      throw createError({ statusCode: 400, message: 'sessionId est requis.' })
    }

    console.log('[PDS PayPal] create-order sessionId', sessionId)

    const session = await getSessionRecord(sessionId)
    if (!session) {
      throw createError({ statusCode: 404, message: firebaseAdminUserMessage.sessionNotFound })
    }

    console.log('[PDS PayPal] create-order session Firestore', {
      status: session.status,
      date: session.date,
      depositAmount: session.depositAmount,
      totalPrice: session.totalPrice,
    })

    if (session.status !== 'waiting_payment') {
      throw createError({
        statusCode: 409,
        message: firebaseAdminUserMessage.sessionNotPayable(session.status),
      })
    }

    const expectedDeposit = expectedDepositForRecord(session)

    console.log('[PDS PayPal] create-order PayPal', { mode, expectedDeposit })

    const accessToken = await getPaypalAccessToken(clientId, clientSecret, mode)
    const order = await createPaypalOrder(sessionId, expectedDeposit, accessToken, mode)

    console.log('[PDS PayPal] create-order ← succès', {
      orderId: order.orderId,
      status: order.status,
    })

    return {
      orderId: order.orderId,
      status: order.status,
    }
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string; data?: unknown }
    console.error('[PDS PayPal] create-order ← échec', {
      statusCode: err?.statusCode,
      message: err?.message ?? String(e),
    })
    throw e
  }
})
