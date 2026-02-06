declare global {
  interface Window {
    paypal?: any
  }
}

let paypalLoaded = false
let paypalPromise: Promise<any> | null = null

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const clientId = config.public.paypalClientId

  const loadPaypal = () => {
    if (!process.client) return Promise.resolve(null)
    if (paypalLoaded && window.paypal) {
      return Promise.resolve(window.paypal)
    }
    if (paypalPromise) {
      return paypalPromise
    }

    paypalPromise = new Promise((resolve, reject) => {
      if (!clientId) {
        reject(new Error('PayPal client ID manquant'))
        return
      }

      const script = document.createElement('script')
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=EUR`
      script.async = true
      script.onload = () => {
        paypalLoaded = true
        resolve(window.paypal)
      }
      script.onerror = () => {
        reject(new Error('Échec du chargement du SDK PayPal'))
      }
      document.head.appendChild(script)
    })

    return paypalPromise
  }

  return {
    provide: {
      loadPaypal,
    },
  }
})

