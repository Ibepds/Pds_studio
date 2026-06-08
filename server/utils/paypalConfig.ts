import { resolvePaypalMode, type PayPalMode } from './paypal'

/** Lit la config PayPal serveur (priorité process.env pour Netlify au runtime). */
export function getPaypalServerConfig(config: ReturnType<typeof useRuntimeConfig>): {
  clientId: string
  clientSecret: string
  mode: PayPalMode
} {
  const clientId = (
    process.env.NUXT_PUBLIC_PAYPAL_CLIENT_ID ||
    (config.public.paypalClientId as string) ||
    ''
  ).trim()

  const clientSecret = (
    process.env.NUXT_PAYPAL_CLIENT_SECRET ||
    process.env.PAYPAL_CLIENT_SECRET ||
    (config.paypalClientSecret as string) ||
    ''
  ).trim()

  const modeRaw =
    process.env.PAYPAL_MODE ||
    (config.paypalMode as string) ||
    (config.public.paypalMode as string) ||
    ''

  const mode = resolvePaypalMode({
    paypalMode: modeRaw,
    paypalClientId: clientId,
  })

  return { clientId, clientSecret, mode }
}

export function paypalConfigDiagnostics(config: ReturnType<typeof useRuntimeConfig>) {
  const { clientId, clientSecret, mode } = getPaypalServerConfig(config)
  return {
    hasClientId: Boolean(clientId),
    hasSecret: Boolean(clientSecret),
    mode,
    clientIdPrefix: clientId ? `${clientId.slice(0, 10)}…` : null,
    secretFromEnv: Boolean(
      process.env.NUXT_PAYPAL_CLIENT_SECRET?.trim() || process.env.PAYPAL_CLIENT_SECRET?.trim(),
    ),
    secretFromRuntimeConfig: Boolean((config.paypalClientSecret as string)?.trim()),
  }
}
