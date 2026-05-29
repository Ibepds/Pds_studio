import { ref } from 'vue'
import { depositForSession } from '../utils/sessionDeposit'
import { paypalErrorMessage, paypalLog, paypalLogError } from '../utils/paypalLog'
import type { PayPalV6OneTimePaymentSession } from '../app/types/paypal-v6'
import { getPaypalSdkInstance } from './usePaypal'

export type PaypalCheckoutCallbacks = {
  onSuccess?: () => void | Promise<void>
  onError?: (message: string) => void | Promise<void>
  onCancel?: () => void | Promise<void>
}

async function captureOrderOnServer(sessionId: string, orderId: string) {
  paypalLog('capture-order → requête', { sessionId, orderId })
  try {
    const res = await $fetch<{ ok: boolean; alreadyPaid?: boolean }>('/api/paypal/capture-order', {
      method: 'POST',
      body: { sessionId, orderId },
    })
    paypalLog('capture-order ← réponse', res as Record<string, unknown>)
    return res
  } catch (e) {
    paypalLogError('capture-order ← échec', e, { sessionId, orderId })
    throw e
  }
}

async function createOrderOnServer(sessionId: string): Promise<{ orderId: string }> {
  paypalLog('create-order → requête', { sessionId })
  try {
    const res = await $fetch<{ orderId: string; status?: string }>('/api/paypal/create-order', {
      method: 'POST',
      body: { sessionId },
    })
    paypalLog('create-order ← réponse', res as Record<string, unknown>)
    if (!res?.orderId) {
      throw new Error('Réponse create-order invalide (orderId manquant).')
    }
    return { orderId: res.orderId }
  } catch (e) {
    paypalLogError('create-order ← échec', e, { sessionId })
    throw e
  }
}

let activeSession: PayPalV6OneTimePaymentSession | null = null
let activeSessionKey: string | null = null

function destroyActiveSession() {
  if (activeSession?.destroy) {
    try {
      activeSession.destroy()
      paypalLog('session.destroy')
    } catch (e) {
      paypalLogError('session.destroy échec', e)
    }
  }
  activeSession = null
  activeSessionKey = null
}

export function usePaypalCheckout() {
  const paypalError = ref<string | null>(null)
  const paypalLoading = ref(false)

  async function startPaypalCheckout(
    options: {
      sessionId: string
      depositEur: number
      autoStart?: boolean
      force?: boolean
    } & PaypalCheckoutCallbacks,
  ) {
    const { sessionId, depositEur, autoStart = true, force, onSuccess, onError, onCancel } = options
    const sessionKey = sessionId

    paypalLog('startPaypalCheckout', { sessionId, depositEur, autoStart, force })

    paypalError.value = null
    paypalLoading.value = true

    try {
      if (!force && activeSessionKey === sessionKey && !autoStart) {
        paypalLog('start ignoré (session déjà active)')
        return
      }

      destroyActiveSession()

      paypalLog('SDK → chargement instance')
      const sdk = await getPaypalSdkInstance()
      paypalLog('SDK ← instance OK')

      paypalLog('findEligibleMethods → EUR')
      const methods = await sdk.findEligibleMethods({ currencyCode: 'EUR' })
      const eligible = methods.isEligible('paypal')
      paypalLog('findEligibleMethods ←', { eligible })

      if (!eligible) {
        throw new Error('PayPal n’est pas disponible pour ce navigateur ou cette région.')
      }

      paypalLog('createPayPalOneTimePaymentSession')
      const paymentSession = sdk.createPayPalOneTimePaymentSession({
        onApprove: async (data) => {
          paypalLog('onApprove', data as unknown as Record<string, unknown>)
          const orderId = data?.orderId
          if (!orderId) {
            paypalLogError('onApprove sans orderId', data)
            throw new Error('Identifiant de commande PayPal manquant.')
          }
          paypalLoading.value = true
          try {
            await captureOrderOnServer(sessionId, orderId)
            paypalLog('onApprove → succès métier')
            await onSuccess?.()
          } catch (e: unknown) {
            const msg = paypalErrorMessage(e)
            paypalLogError('onApprove → échec capture/success', e, { sessionId, orderId })
            paypalError.value = msg
            await onError?.(msg)
            throw e
          } finally {
            paypalLoading.value = false
          }
        },
        onCancel: (data) => {
          paypalLog('onCancel', (data ?? {}) as Record<string, unknown>)
          paypalLoading.value = false
          void onCancel?.()
        },
        onError: (error: unknown) => {
          paypalLogError('onError (SDK PayPal)', error, { sessionId })
          const msg = paypalErrorMessage(error)
          paypalError.value = msg
          paypalLoading.value = false
          void onError?.(msg)
        },
      })

      activeSession = paymentSession
      activeSessionKey = sessionKey

      if (autoStart) {
        paypalLog('session.start → presentationMode:auto')
        try {
          const orderPromise = createOrderOnServer(sessionId).then((result) => {
            paypalLog('session.start ← createOrder OK', result)
            return result
          })
          orderPromise.catch((e) => {
            paypalLogError('session.start ← createOrder échec', e, { sessionId })
          })
          await paymentSession.start({ presentationMode: 'auto' }, orderPromise)
          paypalLog('session.start ← terminé (popup fermée ou flux complété)')
        } catch (e) {
          paypalLogError('session.start ← échec', e, { sessionId })
          throw e
        }
      }
    } catch (e: unknown) {
      const msg = paypalErrorMessage(e)
      paypalLogError('startPaypalCheckout ← échec global', e, { sessionId, depositEur })
      paypalError.value = msg
      await onError?.(msg)
      destroyActiveSession()
    } finally {
      paypalLoading.value = false
      paypalLog('startPaypalCheckout fin', { paypalError: paypalError.value })
    }
  }

  async function renderPaypalButton(
    options: {
      containerId?: string
      sessionId: string
      depositEur: number
      force?: boolean
    } & PaypalCheckoutCallbacks,
  ) {
    await startPaypalCheckout({
      sessionId: options.sessionId,
      depositEur: options.depositEur,
      autoStart: true,
      force: options.force,
      onSuccess: options.onSuccess,
      onError: options.onError,
      onCancel: options.onCancel,
    })
  }

  async function destroyPaypalButton() {
    destroyActiveSession()
  }

  return {
    paypalError,
    paypalLoading,
    depositForSession,
    startPaypalCheckout,
    renderPaypalButton,
    destroyPaypalButton,
  }
}
