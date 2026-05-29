/**
 * Crée une commande PayPal côté serveur (Orders v2) pour le SDK v6.
 */
import {
  createPaypalOrder,
  getPaypalAccessToken,
  resolvePaypalMode,
} from '../../utils/paypal'
import {
  expectedDepositForRecord,
  getSessionRecord,
} from '../../utils/firebaseAdmin'

interface CreateOrderBody {
  sessionId?: string
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const clientId = (config.public.paypalClientId as string)?.trim()
  const clientSecret = (config.paypalClientSecret as string)?.trim()

  console.log('[PDS PayPal] create-order → début')

  if (!clientId || !clientSecret) {
    console.error('[PDS PayPal] create-order config manquante', {
      hasClientId: !!clientId,
      hasSecret: !!clientSecret,
    })
    const missing: string[] = []
    if (!clientId) missing.push('NUXT_PUBLIC_PAYPAL_CLIENT_ID')
    if (!clientSecret) missing.push('PAYPAL_CLIENT_SECRET')
    throw createError({
      statusCode: 503,
      message: `PayPal serveur non configuré : ajouter ${missing.join(' et ')} dans .env puis redémarrer \`npm run dev\`.`,
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
      throw createError({ statusCode: 404, message: 'Session introuvable.' })
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
        message: `Impossible de créer la commande : statut « ${session.status} ».`,
      })
    }

    const expectedDeposit = expectedDepositForRecord(session)
    const mode = resolvePaypalMode({
      paypalMode: config.paypalMode as string,
      paypalClientId: clientId,
    })

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
