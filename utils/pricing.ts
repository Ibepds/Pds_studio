/**
 * Tarifs et règles PDS (alignés sur la maquette HTML)
 * 50€/h en semaine, 60€/h le week-end. Acompte 30%.
 */
export const PRICE_WEEKDAY = 50
export const PRICE_WEEKEND = 60
export const DEPOSIT_PERCENT = 0.3
export const DURATION_OPTIONS = [1, 2, 3, 4, 6] as const
export const SLOT_START_HOUR = 10
export const SLOT_END_HOUR = 22

export type DurationHours = (typeof DURATION_OPTIONS)[number]

/** Retourne true si la date est un samedi ou dimanche */
export function isWeekend(date: Date): boolean {
  const d = date.getDay()
  return d === 0 || d === 6
}

/** Prix à l'heure pour une date donnée */
export function getHourlyRate(date: Date): number {
  return isWeekend(date) ? PRICE_WEEKEND : PRICE_WEEKDAY
}

/** Prix total pour une date, durée en heures */
export function getTotalPrice(date: Date, durationHours: number): number {
  return getHourlyRate(date) * durationHours
}

/** Montant de l'acompte (30%) */
export function getDeposit(totalPrice: number): number {
  return Math.round(totalPrice * DEPOSIT_PERCENT)
}

/** Heure de début possible : 10h à (22 - duration) pour finir avant 23h */
export function getAvailableStartHours(durationHours: number): number[] {
  const hours: number[] = []
  for (let h = SLOT_START_HOUR; h <= SLOT_END_HOUR - durationHours; h++) {
    hours.push(h)
  }
  return hours
}
