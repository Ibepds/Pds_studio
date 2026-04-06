import type { Session } from './useSessions'

export function restToPayForSession(s: Session): number {
  if (s.remainingToPay !== undefined && s.remainingToPay !== null) return s.remainingToPay
  return Math.max(0, (s.totalPrice ?? 0) - (s.depositAmount ?? 0))
}

export function getIngeEmailForSession(
  session: Session,
  ingeList: { uid: string; email?: string | null }[],
): string {
  if (!session?.ingeId) return '—'
  const inge = ingeList.find((i) => i.uid === session.ingeId)
  return inge?.email ?? session.ingeId
}
