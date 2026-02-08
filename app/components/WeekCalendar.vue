<script setup lang="ts">
import { computed, ref } from 'vue'
import { SLOT_START_HOUR, SLOT_END_HOUR } from '../../utils/pricing'

export interface WeekCalendarSession {
  id: string
  date: string
  startTime: string
  endTime: string
  bookerEmail?: string | null
  bookerId?: string
  style?: string
  status?: string
  [key: string]: any
}

const props = defineProps<{
  sessions: WeekCalendarSession[]
  startHour?: number
  endHour?: number
}>()

const startHour = computed(() => props.startHour ?? SLOT_START_HOUR)
const endHour = computed(() => props.endHour ?? SLOT_END_HOUR)
const totalHours = computed(() => endHour.value - startHour.value + 1)

const weekStart = ref(getMonday(new Date()))

function getMonday(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Date en YYYY-MM-DD en heure locale (évite le décalage d’1 jour avec toISOString en UTC) */
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const weekDays = computed(() => {
  const days: { date: Date; dateStr: string; label: string }[] = []
  const m = weekStart.value
  for (let i = 0; i < 7; i++) {
    const d = new Date(m)
    d.setDate(m.getDate() + i)
    const dateStr = toDateStr(d)
    const dayNum = d.getDate()
    const short = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][d.getDay() === 0 ? 6 : d.getDay() - 1]
    days.push({ date: d, dateStr, label: `${short} ${dayNum}` })
  }
  return days
})

const weekLabel = computed(() => {
  const m = weekStart.value
  const end = new Date(m)
  end.setDate(m.getDate() + 6)
  const months = ['Janv', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']
  if (m.getMonth() === end.getMonth()) {
    return `${months[m.getMonth()]} ${m.getFullYear()}`
  }
  return `${months[m.getMonth()]} – ${months[end.getMonth()]} ${m.getFullYear()}`
})

const hourLabels = computed(() => {
  const h: number[] = []
  for (let i = startHour.value; i <= endHour.value; i++) h.push(i)
  return h
})

const weekDateStrs = computed(() => weekDays.value.map((d) => d.dateStr))

const sessionsInWeek = computed(() => {
  const set = new Set(weekDateStrs.value)
  return props.sessions.filter((s) => set.has(s.date))
})

/** Parse "HH:mm" to decimal hours */
function timeToDecimal(t: string): number {
  const parts = (t || '0:0').split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  return h + m / 60
}

/** Grille: row 1 = header, rows 2..1+totalHours = heures. Col 1 = time, cols 2..8 = jours. */
function sessionGridPlace(session: WeekCalendarSession): { gridColumn: number; gridRowStart: number; gridRowEnd: number } {
  const dayIndex = weekDateStrs.value.indexOf(session.date)
  if (dayIndex < 0) return { gridColumn: 2, gridRowStart: 2, gridRowEnd: 2 }
  const startDec = timeToDecimal(session.startTime)
  const endDec = timeToDecimal(session.endTime)
  const rowStart = 2 + Math.max(0, Math.floor(startDec - startHour.value))
  const rowEnd = 2 + Math.min(totalHours.value, Math.ceil(endDec - startHour.value))
  return {
    gridColumn: dayIndex + 2,
    gridRowStart: rowStart,
    gridRowEnd: Math.max(rowEnd, rowStart + 1),
  }
}

function prevWeek() {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() - 7)
  weekStart.value = d
}

function nextWeek() {
  const d = new Date(weekStart.value)
  d.setDate(d.getDate() + 7)
  weekStart.value = d
}

function goToToday() {
  weekStart.value = getMonday(new Date())
}
</script>

<template>
  <div class="week-calendar">
    <div class="week-calendar-header flex flex-wrap items-center justify-between gap-2 pb-3">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded px-2 py-1.5 text-[var(--pds-primary)] hover:bg-[var(--pds-primary)]/10"
          @click="prevWeek"
        >
          ‹
        </button>
        <span class="min-w-[140px] text-center font-medium text-[var(--pds-text)]">
          {{ weekLabel }}
        </span>
        <button
          type="button"
          class="rounded px-2 py-1.5 text-[var(--pds-primary)] hover:bg-[var(--pds-primary)]/10"
          @click="nextWeek"
        >
          ›
        </button>
        <button
          type="button"
          class="rounded px-2 py-1.5 text-sm text-[var(--pds-muted)] hover:text-[var(--pds-primary)]"
          @click="goToToday"
        >
          Aujourd’hui
        </button>
      </div>
    </div>

    <div class="week-calendar-grid overflow-x-auto rounded-lg border border-[var(--pds-border)] bg-[var(--pds-border)]">
      <div
        class="week-calendar-inner"
        :style="{
          '--week-total-hours': totalHours,
          '--week-row-height': '48px',
          '--week-header-height': '32px',
          '--week-time-width': '56px',
          display: 'grid',
          gridTemplateColumns: 'var(--week-time-width) repeat(7, minmax(0, 1fr))',
          gridTemplateRows: 'var(--week-header-height) repeat(var(--week-total-hours), var(--week-row-height))',
          gridGap: '1px',
          minWidth: 'min(100%, 720px)',
        }"
      >
        <!-- Corner -->
        <div class="week-cell-header bg-[var(--pds-bg)]" style="grid-column: 1; grid-row: 1;" />
        <!-- Day headers (cols 2-8) -->
        <div
          v-for="(day, i) in weekDays"
          :key="day.dateStr"
          class="week-cell-header bg-[var(--pds-bg)] py-1.5 text-center text-xs font-medium text-[var(--pds-muted)]"
          :style="{ gridColumn: i + 2, gridRow: 1 }"
        >
          {{ day.label }}
        </div>
        <!-- Time + cells -->
        <template v-for="(h, hi) in hourLabels" :key="h">
          <div
            class="bg-[var(--pds-bg)] pr-1 pt-0.5 text-right text-xs text-[var(--pds-muted)]"
            :style="{ gridColumn: 1, gridRow: hi + 2 }"
          >
            {{ h }}h
          </div>
          <div
            v-for="(day, di) in weekDays"
            :key="`${day.dateStr}-${h}`"
            class="bg-[var(--pds-card)]"
            :style="{ gridColumn: di + 2, gridRow: hi + 2 }"
          />
        </template>
        <!-- Session blocks (same grid) -->
        <div
          v-for="s in sessionsInWeek"
          :key="s.id"
          class="week-calendar-session mx-0.5 my-0.5 overflow-hidden rounded border-l-4 py-1 px-1.5 text-[10px] cursor-pointer min-h-[28px] flex flex-col justify-center"
          :class="{
            'border-amber-500 bg-amber-500/25 text-amber-100': s.status === 'pending',
            'border-emerald-500 bg-emerald-500/25 text-emerald-100': s.status === 'confirmed',
            'border-slate-500 bg-slate-500/25 text-slate-300': s.status === 'done',
            'border-red-500/30 bg-red-500/15 text-red-200': s.status === 'cancelled',
          }"
          :style="{
            gridColumn: sessionGridPlace(s).gridColumn,
            gridRow: `${sessionGridPlace(s).gridRowStart} / ${sessionGridPlace(s).gridRowEnd}`,
          }"
        >
          <span class="font-medium">{{ s.startTime }} – {{ s.endTime }}</span>
          <span class="truncate text-[9px] opacity-95">{{ s.bookerEmail ?? s.bookerId ?? '—' }}</span>
          <span v-if="s.style" class="truncate text-[9px] opacity-80">{{ s.style }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.week-calendar-grid {
  min-height: 200px;
}
.week-calendar-inner {
  /* Traits de séparation = gap de la grille (1px), couleur = fond du conteneur */
  background: var(--pds-border);
}
.week-cell-header {
  min-width: 0;
}
.week-calendar-session:hover {
  filter: brightness(1.15);
}
</style>
