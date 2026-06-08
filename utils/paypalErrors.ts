import type { PayPalMode } from '../server/utils/paypal'

/** Messages PayPal compréhensibles pour l’utilisateur (prod / Netlify). */
export const paypalUserMessage = {
  notConfigured:
    'Le paiement est temporairement indisponible : PayPal n’est pas configuré sur le serveur. Réessayez plus tard ou contactez le studio.',
  authFailed: (mode: PayPalMode) =>
    mode === 'live'
      ? 'Paiement indisponible : identifiants PayPal production invalides. Le studio doit vérifier le Client ID et le secret Live sur Netlify.'
      : 'Paiement indisponible : identifiants PayPal sandbox invalides. Vérifiez PAYPAL_CLIENT_SECRET et PAYPAL_MODE=sandbox.',
  modeMismatch:
    'Paiement indisponible : le mode PayPal (sandbox / live) ne correspond pas au Client ID. Sur Netlify, alignez PAYPAL_MODE avec le type de compte PayPal utilisé.',
  createOrderFailed:
    'Impossible de créer la commande PayPal. Réessayez dans quelques minutes ou contactez le studio.',
  captureFailed:
    'Le paiement PayPal n’a pas pu être finalisé. Si vous avez été débité, contactez le studio avec l’heure du paiement.',
  unavailable:
    'PayPal est temporairement indisponible. Réessayez dans quelques minutes.',
} as const

export function toFrenchPaypalApiError(
  status: number,
  rawBody: string,
  mode: PayPalMode,
  step: 'auth' | 'create' | 'capture',
): string {
  const body = rawBody.toLowerCase()

  if (
    status === 401 ||
    body.includes('invalid_client') ||
    body.includes('client authentication failed')
  ) {
    return paypalUserMessage.authFailed(mode)
  }

  if (body.includes('invalid_grant') || body.includes('unsupported_grant_type')) {
    return paypalUserMessage.authFailed(mode)
  }

  if (
    body.includes('sandbox') &&
    body.includes('live') &&
    (body.includes('not compatible') || body.includes('mismatch'))
  ) {
    return paypalUserMessage.modeMismatch
  }

  if (status >= 500) {
    return paypalUserMessage.unavailable
  }

  if (step === 'auth') return paypalUserMessage.authFailed(mode)
  if (step === 'capture') return paypalUserMessage.captureFailed
  return paypalUserMessage.createOrderFailed
}
