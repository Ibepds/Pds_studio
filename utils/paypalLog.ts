/** Logs PayPal (préfixe commun client + serveur). */
export function paypalLog(step: string, data?: Record<string, unknown> | unknown) {
  const payload =
    data === undefined
      ? ''
      : typeof data === 'object' && data !== null
        ? safeSerialize(data)
        : String(data)
  if (payload) {
    console.log(`[PDS PayPal] ${step}`, payload)
  } else {
    console.log(`[PDS PayPal] ${step}`)
  }
}

export function paypalLogError(step: string, error: unknown, extra?: Record<string, unknown>) {
  console.error(`[PDS PayPal] ${step}`, {
    ...extra,
    error: serializeError(error),
  })
}

function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error === null || error === undefined) {
    return { message: 'unknown' }
  }
  if (error instanceof Error) {
    const out: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
    const anyErr = error as Error & {
      data?: unknown
      statusCode?: number
      statusMessage?: string
      cause?: unknown
    }
    if (anyErr.data !== undefined) out.data = anyErr.data
    if (anyErr.statusCode !== undefined) out.statusCode = anyErr.statusCode
    if (anyErr.statusMessage !== undefined) out.statusMessage = anyErr.statusMessage
    if (anyErr.cause !== undefined) out.cause = serializeError(anyErr.cause)
    return out
  }
  if (typeof error === 'object') {
    try {
      return { ...(error as Record<string, unknown>) }
    } catch {
      return { raw: String(error) }
    }
  }
  return { message: String(error) }
}

export function paypalErrorMessage(error: unknown): string {
  const s = serializeError(error)
  if (typeof s.data === 'object' && s.data && 'message' in (s.data as object)) {
    const serverMsg = String((s.data as { message: unknown }).message)
    if (serverMsg && !serverMsg.startsWith('[POST]')) return serverMsg
  }
  if (typeof s.message === 'string' && s.message) return s.message
  return safeSerialize(s).slice(0, 500) || 'Erreur PayPal inconnue'
}
