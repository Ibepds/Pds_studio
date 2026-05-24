export interface TimeSlot {
  start: string
  end: string
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function intersectRange(
  a: TimeSlot,
  b: TimeSlot,
): TimeSlot | null {
  const start = Math.max(toMinutes(a.start), toMinutes(b.start))
  const end = Math.min(toMinutes(a.end), toMinutes(b.end))
  if (start >= end) return null
  const h = (n: number) => `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`
  return { start: h(start), end: h(end) }
}

export function slotOverlapsAny(slot: TimeSlot, slots: TimeSlot[]): boolean {
  return slots.some((s) => intersectRange(slot, s) !== null)
}
