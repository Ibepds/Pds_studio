/**
 * Charge le SDK PayPal côté client (sans dépendre du plugin).
 * Utiliser au clic (ex: initPaypalBooking) pour être sûr d'être côté client.
 */
let paypalLoaded = false
let paypalPromise: Promise<any> | null = null

export const usePaypal = (): (() => Promise<any>) => {
  if (!import.meta.client) {
    return () => Promise.reject(new Error('PayPal disponible uniquement côté client.'))
  }

  return () => {
    if (paypalLoaded && typeof window !== 'undefined' && (window as any).paypal) {
      return Promise.resolve((window as any).paypal)
    }
    if (paypalPromise) {
      return paypalPromise
    }

    const config = useRuntimeConfig()
    const clientId = config.public.paypalClientId as string | undefined

    if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
      paypalPromise = Promise.reject(
        new Error(
          'PayPal client ID manquant. Définir NUXT_PUBLIC_PAYPAL_CLIENT_ID dans .env et redémarrer le serveur.',
        ),
      )
      return paypalPromise
    }

    paypalPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      // Chargement standard PayPal. (On ajuste ensuite côté `paypal.Buttons`.)
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=EUR`
      script.async = true
      script.onload = () => {
        paypalLoaded = true
        resolve((window as any).paypal)
      }
      script.onerror = () => {
        reject(new Error('Échec du chargement du SDK PayPal'))
      }
      document.head.appendChild(script)
    })

    return paypalPromise
  }
}
