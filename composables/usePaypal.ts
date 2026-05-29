import type { PayPalV6SdkInstance } from '../app/types/paypal-v6'
import { paypalLog, paypalLogError } from '../utils/paypalLog'

let sdkPromise: Promise<PayPalV6SdkInstance> | null = null
let scriptLoaded = false

function getPaypalCoreScriptUrl(): string {
  const config = useRuntimeConfig()
  const mode = (config.public.paypalMode as string)?.trim().toLowerCase()
  const clientId = (config.public.paypalClientId as string)?.toLowerCase() ?? ''
  const isSandbox =
    mode === 'sandbox' || clientId.includes('sandbox') || clientId.startsWith('sb-')
  const url = isSandbox
    ? 'https://www.sandbox.paypal.com/web-sdk/v6/core'
    : 'https://www.paypal.com/web-sdk/v6/core'
  paypalLog('script URL', { mode: isSandbox ? 'sandbox' : 'live', url })
  return url
}

function loadPaypalV6Script(): Promise<void> {
  if (!import.meta.client) {
    return Promise.reject(new Error('PayPal disponible uniquement côté client.'))
  }

  if (scriptLoaded && window.paypal?.createInstance) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pds-paypal-v6]')
    if (existing) {
      if (window.paypal?.createInstance) {
        scriptLoaded = true
        resolve()
        return
      }
      existing.addEventListener('load', () => {
        scriptLoaded = true
        resolve()
      })
      existing.addEventListener('error', () => reject(new Error('Échec du chargement PayPal v6')))
      return
    }

    const script = document.createElement('script')
    script.src = getPaypalCoreScriptUrl()
    script.async = true
    script.dataset.pdsPaypalV6 = 'true'
    script.onload = () => {
      scriptLoaded = true
      resolve()
    }
    script.onerror = () => reject(new Error('Échec du chargement du SDK PayPal v6'))
    document.head.appendChild(script)
  })
}

/**
 * Instance SDK PayPal v6 (client ID public).
 */
export async function getPaypalSdkInstance(): Promise<PayPalV6SdkInstance> {
  const config = useRuntimeConfig()
  const clientId = config.public.paypalClientId as string | undefined

  if (!clientId?.trim()) {
    throw new Error(
      'PayPal client ID manquant. Définir NUXT_PUBLIC_PAYPAL_CLIENT_ID dans .env et redémarrer le serveur.',
    )
  }

  if (sdkPromise) {
    return sdkPromise
  }

  sdkPromise = (async () => {
    paypalLog('createInstance →', {
      clientIdPrefix: `${clientId.trim().slice(0, 12)}…`,
    })
    await loadPaypalV6Script()
    if (!window.paypal?.createInstance) {
      throw new Error('PayPal v6 non disponible après chargement du script.')
    }
    const instance = await window.paypal.createInstance({
      clientId: clientId.trim(),
      components: ['paypal-payments'],
      pageType: 'checkout',
      locale: 'fr-FR',
    })
    paypalLog('createInstance ← OK')
    return instance
  })()

  try {
    return await sdkPromise
  } catch (e) {
    paypalLogError('createInstance ← échec', e)
    sdkPromise = null
    throw e
  }
}

/** @deprecated Utiliser getPaypalSdkInstance — conservé pour compatibilité minimale. */
export const usePaypal = (): (() => Promise<PayPalV6SdkInstance>) => {
  return () => getPaypalSdkInstance()
}
