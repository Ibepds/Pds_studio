<script setup lang="ts">
import { computed } from 'vue'

/** Minuit (00:00) en haut → 23:00 en bas */
const HOURS_ASC = Array.from({ length: 24 }, (_, i) => i)

const props = withDefaults(
  defineProps<{
    weekStartMonday: Date
    /** `null` tant que la durée n’est pas choisie : grille visible mais non interactive */
    durationHours: number | null
    modelDate: string
    modelStartHour: number | null
    loading?: boolean
    /** Heures de début possibles par jour (YYYY-MM-DD) */
    availableStartsByDate: Record<string, number[]>
    /** Heures où une session existante chevauche ce créneau horaire */
    occupiedHoursByDate: Record<string, number[]>
  }>(),
  { loading: false },
)

const locked = computed(() => props.durationHours == null)

const emit = defineEmits<{
  pick: [{ dateStr: string; hour: number }]
  'prev-week': []
  'next-week': []
}>()

const monthNames = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

const dayLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

function padDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const weekDates = computed(() => {
  const d = new Date(props.weekStartMonday)
  d.setHours(12, 0, 0, 0)
  const out: { dateStr: string; label: string; shortLabel: string }[] = []
  for (let i = 0; i < 7; i++) {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    const dateStr = padDate(x.getFullYear(), x.getMonth(), x.getDate())
    const dow = x.getDay()
    const labelIdx = dow === 0 ? 6 : dow - 1
    const label = `${dayLabels[labelIdx]} ${x.getDate()} ${monthNames[x.getMonth()]}`
    const shortLabel = `${dayLabels[labelIdx].slice(0, 3)} ${x.getDate()}`
    out.push({ dateStr, label, shortLabel })
  }
  return out
})

function occupiedSet(dateStr: string): Set<number> {
  return new Set(props.occupiedHoursByDate[dateStr] ?? [])
}

function availableStarts(dateStr: string): number[] {
  return props.availableStartsByDate[dateStr] ?? []
}

function canPick(dateStr: string, hour: number): boolean {
  if (props.durationHours == null) return false
  return availableStarts(dateStr).includes(hour)
}

function isSelected(dateStr: string, hour: number): boolean {
  if (props.durationHours == null || props.modelDate !== dateStr || props.modelStartHour == null) {
    return false
  }
  const end = props.modelStartHour + props.durationHours
  return hour >= props.modelStartHour && hour < end
}

function isOccupied(dateStr: string, hour: number): boolean {
  return occupiedSet(dateStr).has(hour)
}

function cellClass(dateStr: string, hour: number): string {
  if (props.durationHours == null) {
    return 'booking-slot-grid__cell booking-slot-grid__cell--locked'
  }
  if (isSelected(dateStr, hour)) {
    return 'booking-slot-grid__cell booking-slot-grid__cell--selected'
  }
  if (isOccupied(dateStr, hour)) {
    return 'booking-slot-grid__cell booking-slot-grid__cell--occupied'
  }
  if (canPick(dateStr, hour)) {
    return 'booking-slot-grid__cell booking-slot-grid__cell--free booking-slot-grid__cell--clickable'
  }
  return 'booking-slot-grid__cell booking-slot-grid__cell--free booking-slot-grid__cell--muted'
}

function onCellClick(dateStr: string, hour: number) {
  if (locked.value || !canPick(dateStr, hour) || props.loading) return
  emit('pick', { dateStr, hour })
}

function hourLabelClass(h: number): string {
  if (props.durationHours == null || props.modelStartHour == null) {
    return 'booking-slot-grid__hour'
  }
  const sel =
    props.modelDate &&
    h >= props.modelStartHour &&
    h < props.modelStartHour + props.durationHours
  return sel ? 'booking-slot-grid__hour booking-slot-grid__hour--active' : 'booking-slot-grid__hour'
}

function formatHourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}
</script>

<template>
  <div class="booking-slot-grid-wrap">
    <div
      class="booking-slot-grid-panel relative overflow-hidden rounded-[10px] border border-white/20 bg-[rgba(27,27,27,0.5)] px-3 pb-4 pt-6 sm:px-6 sm:pb-5 sm:pt-10"
      :class="{ 'pointer-events-none': locked }"
      :aria-disabled="locked"
    >
        <div
          class="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <h3
            class="font-[Raleway,sans-serif] text-xl font-bold leading-none text-white sm:text-2xl md:text-[30px]"
          >
            Sélectionner votre créneau
          </h3>
          <div class="flex flex-wrap items-center gap-5 text-[15px] text-white">
            <span class="inline-flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-[#0073FF]" aria-hidden="true" />
              <span class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] font-normal"
                >Votre sélection</span
              >
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-[#3D3D3D]" aria-hidden="true" />
              <span class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] font-normal"
                >Occupé</span
              >
            </span>
          </div>
        </div>

        <div
          v-if="loading"
          class="absolute inset-0 z-10 flex items-center justify-center bg-black/40"
        >
          <span class="text-sm text-white/80">Chargement des créneaux…</span>
        </div>

        <div class="booking-slot-grid__scroll min-w-0 overflow-x-auto">
          <div
            class="booking-slot-grid__matrix"
            :style="{
              display: 'grid',
              gridTemplateColumns:
                'var(--bsg-time-width) repeat(7, minmax(var(--bsg-col-min), 1fr)) var(--bsg-time-width)',
              gridTemplateRows: `repeat(24, var(--bsg-row-height)) var(--bsg-day-label-height)`,
              gap: 'var(--bsg-gap)',
            }"
          >
            <template v-for="(h, hi) in HOURS_ASC" :key="h">
              <div
                :class="hourLabelClass(h)"
                :style="{ gridColumn: 1, gridRow: hi + 1 }"
              >
                {{ formatHourLabel(h) }}
              </div>

              <button
                v-for="(col, di) in weekDates"
                :key="col.dateStr + '-' + h"
                type="button"
                :disabled="locked || loading || !canPick(col.dateStr, h)"
                :class="cellClass(col.dateStr, h)"
                :style="{ gridColumn: di + 2, gridRow: hi + 1 }"
                :aria-label="`Créneau ${col.label} ${formatHourLabel(h)}`"
                @click="onCellClick(col.dateStr, h)"
              />

              <div
                :class="hourLabelClass(h)"
                :style="{ gridColumn: 9, gridRow: hi + 1 }"
              >
                {{ formatHourLabel(h) }}
              </div>
            </template>

            <div :style="{ gridColumn: 1, gridRow: 25 }" aria-hidden="true" />

            <div
              v-for="(col, di) in weekDates"
              :key="'day-' + col.dateStr"
              class="booking-slot-grid__day-label"
              :style="{ gridColumn: di + 2, gridRow: 25 }"
            >
              <span class="hidden sm:inline">{{ col.label }}</span>
              <span class="sm:hidden">{{ col.shortLabel }}</span>
            </div>

            <div :style="{ gridColumn: 9, gridRow: 25 }" aria-hidden="true" />
          </div>
        </div>

        <div class="mt-4 flex items-center justify-center gap-4 sm:mt-5">
          <button
            type="button"
            class="rounded px-2 text-xl leading-none transition"
            :class="
              locked ? 'cursor-not-allowed text-white/30' : 'text-white/80 hover:text-white'
            "
            aria-label="Semaine précédente"
            :disabled="locked"
            @click="emit('prev-week')"
          >
            ‹
          </button>
          <button
            type="button"
            class="rounded px-2 text-xl leading-none transition"
            :class="
              locked ? 'cursor-not-allowed text-white/30' : 'text-white/80 hover:text-white'
            "
            aria-label="Semaine suivante"
            :disabled="locked"
            @click="emit('next-week')"
          >
            ›
          </button>
        </div>
    </div>
  </div>
</template>

<style scoped>
.booking-slot-grid__matrix {
  --bsg-row-height: 18px;
  --bsg-day-label-height: auto;
  --bsg-gap: 4px;
  --bsg-time-width: 37px;
  --bsg-col-min: 72px;
  min-width: min(100%, 1200px);
}

@media (min-width: 640px) {
  .booking-slot-grid__matrix {
    --bsg-col-min: 100px;
  }
}

.booking-slot-grid__hour {
  height: var(--bsg-row-height);
  font-family: Helvetica Neue, Helvetica, Arial, sans-serif;
  font-size: 12px;
  font-weight: 300;
  line-height: var(--bsg-row-height);
  text-align: center;
  color: #818181;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.booking-slot-grid__hour--active {
  font-weight: 700;
  color: #ffffff;
}

.booking-slot-grid__day-label {
  padding-top: 8px;
  text-align: center;
  font-family: Helvetica Neue, Helvetica, Arial, sans-serif;
  font-size: 10px;
  font-weight: 300;
  line-height: 1.25;
  color: #818181;
  min-width: 0;
}

@media (min-width: 640px) {
  .booking-slot-grid__day-label {
    font-size: 12px;
  }
}

.booking-slot-grid__cell {
  width: 100%;
  height: var(--bsg-row-height);
  border: none;
  border-radius: 6px;
  padding: 0;
  min-width: 0;
  transition: opacity 0.15s ease;
}

.booking-slot-grid__cell--free {
  background: #242424;
}

.booking-slot-grid__cell--muted {
  opacity: 0.55;
  cursor: not-allowed;
}

.booking-slot-grid__cell--locked {
  background: #242424;
  opacity: 0.65;
  cursor: not-allowed;
}

.booking-slot-grid__cell--clickable {
  cursor: pointer;
}

.booking-slot-grid__cell--clickable:hover:not(:disabled) {
  filter: brightness(1.12);
}

.booking-slot-grid__cell--occupied {
  background: #3d3d3d;
  cursor: not-allowed;
}

.booking-slot-grid__cell--selected {
  background: linear-gradient(90deg, #0073ff -2.73%, #64e8ff 118.36%);
  cursor: default;
}

.booking-slot-grid__cell:disabled {
  cursor: not-allowed;
}
</style>
