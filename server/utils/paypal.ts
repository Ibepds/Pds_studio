import { depositAmountToPaypalValue } from '../../utils/sessionDeposit'
import { toFrenchPaypalApiError } from '../../utils/paypalErrors'

export type PayPalMode = 'sandbox' | 'live'

export function getPaypalApiBase(mode: PayPalMode): string {
  return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
}

export function resolvePaypalMode(config: {
  paypalMode?: string
  paypalClientId?: string
}): PayPalMode {
  const explicit = (config.paypalMode || '').trim().toLowerCase()
  if (explicit === 'live') return 'live'
  if (explicit === 'sandbox') return 'sandbox'
  const clientId = (config.paypalClientId || '').toLowerCase()
  if (clientId.includes('sandbox') || clientId.startsWith('sb-')) return 'sandbox'
  return 'sandbox'
}

let cachedToken: { value: string; expiresAt: number; mode: PayPalMode } | null = null

export async function getPaypalAccessToken(
  clientId: string,
  clientSecret: string,
  mode: PayPalMode,
): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.mode === mode && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.value
  }

  const apiBase = getPaypalApiBase(mode)
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[PDS PayPal] oauth2 token échec', {
      mode,
      status: res.status,
      api: apiBase,
      clientIdPrefix: `${clientId.slice(0, 12)}…`,
      body: text.slice(0, 300),
    })
    if (res.status === 401 && text.toLowerCase().includes('invalid_client')) {
      console.error(
        mode === 'live'
          ? '[PDS PayPal] LIVE invalid_client → vérifier : (1) Client ID Live + Secret Live de la MÊME app PayPal, (2) PAYPAL_MODE=live sur Netlify, (3) redéploiement après changement de NUXT_PUBLIC_PAYPAL_CLIENT_ID, (4) compte Business PayPal vérifié.'
          : '[PDS PayPal] SANDBOX invalid_client → vérifier PAYPAL_CLIENT_SECRET et PAYPAL_MODE=sandbox (même app que le Client ID).',
      )
    }
    throw createError({
      statusCode: 502,
      message: toFrenchPaypalApiError(res.status, text, mode, 'auth'),
    })
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) {
    throw createError({
      statusCode: 502,
      message: toFrenchPaypalApiError(502, 'missing access_token', mode, 'auth'),
    })
  }

  const expiresIn = (data.expires_in ?? 3600) * 1000
  cachedToken = {
    value: data.access_token,
    expiresAt: now + expiresIn,
    mode,
  }
  return data.access_token
}

export interface PayPalCreateOrderResult {
  orderId: string
  status: string
}

/** Crée une commande PayPal (Orders v2) avant le flux SDK v6. */
export async function createPaypalOrder(
  sessionId: string,
  depositEur: number,
  accessToken: string,
  mode: PayPalMode,
): Promise<PayPalCreateOrderResult> {
  const apiBase = getPaypalApiBase(mode)
  const value = depositAmountToPaypalValue(depositEur)

  const res = await fetch(`${apiBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `pds-${sessionId}-${Date.now()}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: sessionId,
          description: 'Acompte 30% — réservation session studio PDS',
          amount: {
            currency_code: 'EUR',
            value,
          },
        },
      ],
    }),
  })

  const body = (await res.json()) as Record<string, unknown>

  if (!res.ok) {
    const details = JSON.stringify(body).slice(0, 800)
    console.error('[PDS PayPal] createPaypalOrder API échec', { mode, status: res.status, body: details })
    throw createError({
      statusCode: 502,
      message: toFrenchPaypalApiError(res.status, details, mode, 'create'),
    })
  }

  const orderId = String(body.id ?? '')
  if (!orderId) {
    throw createError({
      statusCode: 502,
      message: toFrenchPaypalApiError(502, 'missing order id', mode, 'create'),
    })
  }

  return {
    orderId,
    status: String(body.status ?? 'CREATED'),
  }
}

export interface PayPalCaptureResult {
  id: string
  status: string
  amountValue: string
  currency: string
  customId?: string
}

export async function capturePaypalOrder(
  orderId: string,
  accessToken: string,
  mode: PayPalMode,
): Promise<PayPalCaptureResult> {
  const apiBase = getPaypalApiBase(mode)
  const res = await fetch(`${apiBase}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  const body = (await res.json()) as Record<string, unknown>

  if (!res.ok) {
    const details = JSON.stringify(body).slice(0, 400)
    console.error('[PDS PayPal] capture API échec', { mode, status: res.status, body: details })
    throw createError({
      statusCode: 502,
      message: toFrenchPaypalApiError(res.status, details, mode, 'capture'),
    })
  }

  const status = String(body.status ?? '')
  if (status !== 'COMPLETED') {
    throw createError({
      statusCode: 502,
      message: `Commande PayPal non complétée (statut: ${status || 'inconnu'}).`,
    })
  }

  const units = body.purchase_units as Array<Record<string, unknown>> | undefined
  const unit = units?.[0]
  const payments = unit?.payments as { captures?: Array<Record<string, unknown>> } | undefined
  const capture = payments?.captures?.[0]
  const amount = capture?.amount as { value?: string; currency_code?: string } | undefined

  if (!amount?.value) {
    throw createError({ statusCode: 502, message: 'Montant capturé PayPal introuvable.' })
  }

  return {
    id: String(capture?.id ?? orderId),
    status,
    amountValue: amount.value,
    currency: amount.currency_code ?? 'EUR',
    customId: unit?.custom_id as string | undefined,
  }
}

/** Vérifie que le montant capturé correspond à l’acompte attendu (tolérance 0,01 €). */
export function assertCapturedAmountMatches(
  capturedValue: string,
  expectedDepositEur: number,
  currency: string,
): void {
  if (currency !== 'EUR') {
    throw createError({
      statusCode: 400,
      message: `Devise PayPal inattendue: ${currency} (EUR attendu).`,
    })
  }
  const captured = Number.parseFloat(capturedValue)
  const expected = Number.parseFloat(depositAmountToPaypalValue(expectedDepositEur))
  if (!Number.isFinite(captured) || Math.abs(captured - expected) > 0.01) {
    throw createError({
      statusCode: 400,
      message: `Montant PayPal (${capturedValue}€) ne correspond pas à l’acompte attendu (${expected.toFixed(2)}€).`,
    })
  }
}
