/** Montant acompte 30 % aligné sur le booker / PayPal. */
export function depositForSession(session: {
  depositAmount?: number
  totalPrice?: number
}): number {
  if (typeof session.depositAmount === 'number' && session.depositAmount >= 0) {
    return session.depositAmount
  }
  const total = typeof session.totalPrice === 'number' ? session.totalPrice : 50
  return Math.round(total * 0.3)
}

export function depositAmountToPaypalValue(depositEur: number): string {
  const n = typeof depositEur === 'number' && Number.isFinite(depositEur) ? depositEur : 0
  return Math.max(0, n).toFixed(2)
}
