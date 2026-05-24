import { nextTick, ref } from 'vue'
import { depositAmountToPaypalValue, depositForSession } from '../utils/sessionDeposit'
import { usePaypal } from './usePaypal'

export type PaypalCheckoutCallbacks = {
  onSuccess?: () => void | Promise<void>
  onError?: (message: string) => void | Promise<void>
}

let activeButtons: { close: () => Promise<void> } | null = null
let activeRenderKey: string | null = null

async function closeActiveButtons() {
  if (activeButtons) {
    try {
      await activeButtons.close()
    } catch {
      /* ignore */
    }
    activeButtons = null
  }
  activeRenderKey = null
}

function clearContainer(containerId: string) {
  const el = document.getElementById(containerId)
  if (el) el.innerHTML = ''
}

function fetchErrorMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as {
      data?: { message?: string }
      message?: string
      statusMessage?: string
    }
    if (o.data?.message) return o.data.message
    if (o.message) return o.message
    if (o.statusMessage) return o.statusMessage
  }
  return 'Erreur lors de la validation du paiement.'
}

async function captureOrderOnServer(sessionId: string, orderId: string) {
  return await $fetch<{ ok: boolean; alreadyPaid?: boolean }>('/api/paypal/capture-order', {
    method: 'POST',
    body: { sessionId, orderId },
  })
}

export function usePaypalCheckout() {
  const paypalError = ref<string | null>(null)
  const paypalLoading = ref(false)

  async function renderPaypalButton(options: {
    containerId: string
    sessionId: string
    depositEur: number
    force?: boolean
  } & PaypalCheckoutCallbacks) {
    const { containerId, sessionId, depositEur, force, onSuccess, onError } = options
    const renderKey = `${containerId}:${sessionId}`

    paypalError.value = null
    paypalLoading.value = true

    try {
      if (!force && activeRenderKey === renderKey) {
        return
      }

      await closeActiveButtons()
      await nextTick()
      clearContainer(containerId)

      const loadPaypal = usePaypal()
      const paypal = await loadPaypal()
      if (!paypal?.Buttons) {
        throw new Error('PayPal non disponible')
      }

      const valueApi = depositAmountToPaypalValue(depositEur)

      const buttons = paypal.Buttons({
        fundingSource: paypal.FUNDING?.PAYPAL,
        disableFunding: 'card',
        createOrder: (_data: unknown, actions: { order: { create: (o: unknown) => Promise<string> } }) =>
          actions.order.create({
            purchase_units: [
              {
                custom_id: sessionId,
                amount: { value: valueApi, currency_code: 'EUR' },
                description: 'Acompte 30% — réservation session studio PDS',
              },
            ],
          }),
        onApprove: async (data: { orderID?: string }) => {
          const orderId = data?.orderID
          if (!orderId) {
            throw new Error('Identifiant de commande PayPal manquant.')
          }
          paypalLoading.value = true
          try {
            await captureOrderOnServer(sessionId, orderId)
            await onSuccess?.()
          } catch (e: unknown) {
            const msg = fetchErrorMessage(e)
            paypalError.value = msg
            await onError?.(msg)
            throw e
          } finally {
            paypalLoading.value = false
          }
        },
        onError: () => {
          const msg = 'Erreur lors du paiement PayPal.'
          paypalError.value = msg
          void onError?.(msg)
        },
        onCancel: () => {
          paypalLoading.value = false
        },
      })

      if (typeof buttons.isEligible === 'function' && !buttons.isEligible()) {
        throw new Error('PayPal n’est pas disponible pour ce navigateur.')
      }
      await buttons.render(`#${containerId}`)

      activeButtons = buttons
      activeRenderKey = renderKey
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Impossible de charger PayPal.'
      paypalError.value = msg
      await onError?.(msg)
      activeRenderKey = null
    } finally {
      paypalLoading.value = false
    }
  }

  async function destroyPaypalButton() {
    await closeActiveButtons()
  }

  return {
    paypalError,
    paypalLoading,
    depositForSession,
    renderPaypalButton,
    destroyPaypalButton,
  }
}
