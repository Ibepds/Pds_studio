/** Types minimaux PayPal Web SDK v6 (script core). */
export interface PayPalV6ApproveData {
  orderId: string
  payerId?: string
}

export interface PayPalV6OneTimePaymentSession {
  /** 2e argument : Promise (pas une fonction) — voir docs PayPal v6. */
  start: (
    options?: { presentationMode?: 'auto' | 'popup' | 'modal' | 'redirect' },
    orderPromise?: Promise<{ orderId: string }>,
  ) => Promise<void>
  destroy?: () => void
}

export interface PayPalV6SdkInstance {
  findEligibleMethods: (options?: { currencyCode?: string }) => Promise<{
    isEligible: (method: string) => boolean
  }>
  createPayPalOneTimePaymentSession: (options: {
    onApprove: (data: PayPalV6ApproveData) => void | Promise<void>
    onCancel?: (data?: unknown) => void
    onError?: (error: unknown) => void
    orderId?: string
  }) => PayPalV6OneTimePaymentSession
}

export interface PayPalV6Global {
  createInstance: (options: {
    clientId: string
    components?: string[]
    pageType?: string
    locale?: string
  }) => Promise<PayPalV6SdkInstance>
}

declare global {
  interface Window {
    paypal?: PayPalV6Global
  }
}

export {}
