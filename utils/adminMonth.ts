/** Plage inclusive YYYY-MM-DD pour un mois calendaire (monthIndex 0 = janvier). */
export function monthRangeIso(year: number, monthIndex0: number): {
  start: string
  end: string
} {
  const start = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate()
  const end = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export function monthLabelFr(year: number, monthIndex0: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthIndex0, 1))
}

/** Premier jour du mois, N mois avant aujourd’hui (local). */
export function firstDayOfMonthMonthsAgo(monthsAgo: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - monthsAgo)
  d.setDate(1)
  const y = d.getFullYear()
  const m = d.getMonth()
  return `${y}-${String(m + 1).padStart(2, '0')}-01`
}
