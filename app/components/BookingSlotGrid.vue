<script setup lang="ts">
import { computed } from 'vue'

/** Lignes du haut (23:00) vers le bas (00:00), comme la maquette Figma */
const HOURS_DESC = Array.from({ length: 24 }, (_, i) => 23 - i)

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
            <span class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] font-normal">Votre sélection</span>
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-[#3D3D3D]" aria-hidden="true" />
            <span class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] font-normal">Occupé</span>
          </span>
        </div>
      </div>

      <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
        <span class="text-sm text-white/80">Chargement des créneaux…</span>
      </div>

      <div class="booking-slot-grid__scroll min-w-0 overflow-x-auto">
        <div class="booking-slot-grid__inner inline-flex min-w-[min(100%,920px)] gap-2 sm:gap-3">
          <!-- Heures gauche -->
          <div
            class="booking-slot-grid__axis flex w-9 shrink-0 flex-col gap-1 py-0 sm:w-[37px]"
            aria-hidden="true"
          >
            <div
              v-for="h in HOURS_DESC"
              :key="'L' + h"
              :class="hourLabelClass(h)"
            >
              {{ String(h).padStart(2, '0') }}:00
            </div>
          </div>

          <!-- Colonnes jour -->
          <div class="flex min-w-0 flex-1 gap-1 sm:gap-1">
            <div
              v-for="col in weekDates"
              :key="col.dateStr"
              class="flex min-w-[72px] flex-1 flex-col gap-1 sm:min-w-[100px]"
            >
              <button
                v-for="h in HOURS_DESC"
                :key="col.dateStr + '-' + h"
                type="button"
                :disabled="locked || loading || !canPick(col.dateStr, h)"
                :class="cellClass(col.dateStr, h)"
                :aria-label="`Créneau ${col.label} ${String(h).padStart(2, '0')}:00`"
                @click="onCellClick(col.dateStr, h)"
              />
            </div>
          </div>

          <!-- Heures droite -->
          <div
            class="booking-slot-grid__axis flex w-9 shrink-0 flex-col gap-1 py-0 sm:w-[37px]"
            aria-hidden="true"
          >
            <div
              v-for="h in HOURS_DESC"
              :key="'R' + h"
              :class="hourLabelClass(h)"
            >
              {{ String(h).padStart(2, '0') }}:00
            </div>
          </div>
        </div>
      </div>

      <!-- Jours sous la grille -->
      <div
        class="mt-4 flex items-center justify-center gap-2 px-0 text-center sm:mt-5 sm:gap-4 md:gap-9"
      >
        <button
          type="button"
          class="rounded px-1 text-xl leading-none transition"
          :class="
            locked
              ? 'cursor-not-allowed text-white/30'
              : 'text-white/80 hover:text-white'
          "
          aria-label="Semaine précédente"
          :disabled="locked"
          @click="emit('prev-week')"
        >
          ‹
        </button>
        <div
          class="flex max-w-[calc(100%-4rem)] flex-1 flex-wrap justify-center gap-x-2 gap-y-1 sm:gap-x-4 md:gap-x-6"
        >
          <span
            v-for="col in weekDates"
            :key="'d' + col.dateStr"
            class="inline-block min-w-0 text-center font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[10px] font-light leading-tight text-[#818181] sm:text-xs"
          >
            <span class="hidden sm:inline">{{ col.label }}</span>
            <span class="sm:hidden">{{ col.shortLabel }}</span>
          </span>
        </div>
        <button
          type="button"
          class="rounded px-1 text-xl leading-none transition"
          :class="
            locked
              ? 'cursor-not-allowed text-white/30'
              : 'text-white/80 hover:text-white'
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
.booking-slot-grid__axis {
  padding-top: 0;
  padding-bottom: 0;
}

.booking-slot-grid__hour {
  height: 16px;
  font-family: Helvetica Neue, Helvetica, Arial, sans-serif;
  font-size: 12px;
  font-weight: 300;
  line-height: 10px;
  text-align: center;
  color: #818181;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.booking-slot-grid__hour--active {
  font-weight: 700;
  color: #ffffff;
}

.booking-slot-grid__cell {
  width: 100%;
  height: 16px;
  border: none;
  border-radius: 5px;
  padding: 0;
  flex-shrink: 0;
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
