<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useSessions } from '../../composables/useSessions'
import { useAvailability } from '../../composables/useAvailability'

/** Affichage calendrier : minuit en haut, 23h en bas */
const CALENDAR_START_HOUR = 0
const CALENDAR_END_HOUR = 23

export interface WeekCalendarSession {
  id: string
  date: string
  startTime: string
  endTime: string
  bookerEmail?: string | null
  bookerPhone?: string | null
  bookerId?: string
  style?: string
  status?: string
  reservationName?: string
  ingeId?: string
  [key: string]: any
}

const props = defineProps<{
  sessions: WeekCalendarSession[]
  startHour?: number
  endHour?: number
  ingeList?: { uid: string; email?: string | null }[]
}>()

const emit = defineEmits<{
  'session-saved': []
  'session-cancelled': []
}>()

const { listSessionsForDate, updateSessionFields, updateSessionStatus } = useSessions()
const { getSlotsForUsersOnDate } = useAvailability()

// ── Helpers ────────────────────────────────────────────────────
function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function resolveIngeName(ingeId: string | undefined): string {
  if (!ingeId) return '—'
  const found = props.ingeList?.find((u) => u.uid === ingeId)
  return found?.email ?? ingeId
}

function resolveClientName(s: WeekCalendarSession): string {
  if (s.reservationName && String(s.reservationName).trim()) return String(s.reservationName).trim()
  return s.bookerEmail ?? s.bookerId ?? 'Client'
}

// ── Calendrier ────────────────────────────────────────────────
const startHour = computed(() => props.startHour ?? CALENDAR_START_HOUR)
const endHour = computed(() => props.endHour ?? CALENDAR_END_HOUR)
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
  if (m.getMonth() === end.getMonth()) return `${months[m.getMonth()]} ${m.getFullYear()}`
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

function timeToDecimal(t: string): number {
  const parts = (t || '0:0').split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  return h + m / 60
}

function formatHourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

function sessionGridPlace(session: WeekCalendarSession) {
  const dayIndex = weekDateStrs.value.indexOf(session.date)
  if (dayIndex < 0) return { gridColumn: 2, gridRowStart: 1, gridRowEnd: 2 }
  const startDec = timeToDecimal(session.startTime)
  const endDec = timeToDecimal(session.endTime)
  const rowStart = 1 + Math.max(0, Math.floor(startDec - startHour.value))
  const rowEnd = 1 + Math.min(totalHours.value, Math.ceil(endDec - startHour.value))
  return { gridColumn: dayIndex + 2, gridRowStart: rowStart, gridRowEnd: Math.max(rowEnd, rowStart + 1) }
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

// ── Modal ──────────────────────────────────────────────────────
const selectedSession = ref<WeekCalendarSession | null>(null)
const saving = ref(false)
const cancelling = ref(false)
const modalError = ref<string | null>(null)
const availabilityWarning = ref<string | null>(null)

const editForm = reactive({ date: '', startTime: '', endTime: '', ingeId: '' })

function openSession(s: WeekCalendarSession) {
  selectedSession.value = s
  editForm.date = s.date
  editForm.startTime = s.startTime
  editForm.endTime = s.endTime
  editForm.ingeId = s.ingeId ?? props.ingeList?.[0]?.uid ?? ''
  modalError.value = null
  availabilityWarning.value = null
}

function closeModal() {
  selectedSession.value = null
  modalError.value = null
  availabilityWarning.value = null
}

/** Vérifie disponibilités et retourne un message d'erreur ou null si OK. */
async function checkAvailability(): Promise<string | null> {
  const s = selectedSession.value!
  const { date, startTime, endTime, ingeId } = editForm
  const newStart = toMin(startTime)
  const newEnd = toMin(endTime)

  // 1. Chevauchement avec d'autres sessions sur la même date
  const sessionsOnDate = await listSessionsForDate(date)
  const others = sessionsOnDate.filter((other) => other.id !== s.id)
  const sessionConflict = others.find((other) => {
    return newStart < toMin(other.endTime) && newEnd > toMin(other.startTime)
  })
  if (sessionConflict) {
    return `Créneau déjà occupé (${sessionConflict.startTime}–${sessionConflict.endTime}, ${sessionConflict.bookerEmail ?? 'client inconnu'}).`
  }

  // 2. Disponibilité de l'ingé (seulement si il a déclaré des dispos pour ce jour)
  if (ingeId) {
    const slotsMap = await getSlotsForUsersOnDate([ingeId], date)
    const ingeSlots = slotsMap.get(ingeId) ?? []
    if (ingeSlots.length > 0) {
      // L'ingé a des dispos déclarées → on vérifie que le créneau y rentre
      const covered = ingeSlots.some(
        (slot) => toMin(slot.start) <= newStart && toMin(slot.end) >= newEnd,
      )
      if (!covered) {
        const ingeName = resolveIngeName(ingeId)
        const slotsStr = ingeSlots.map((sl) => `${sl.start}–${sl.end}`).join(', ')
        return `${ingeName} n'est pas disponible sur ce créneau. Ses dispos ce jour : ${slotsStr}.`
      }
    }
    // Pas de dispos déclarées → on laisse passer (admin peut forcer)
  }

  return null
}

async function saveSession() {
  const s = selectedSession.value
  if (!s) return
  if (!editForm.date || !editForm.startTime || !editForm.endTime) {
    modalError.value = 'Date et heures obligatoires.'
    return
  }
  if (editForm.startTime >= editForm.endTime) {
    modalError.value = "L'heure de fin doit être après l'heure de début."
    return
  }

  saving.value = true
  modalError.value = null
  availabilityWarning.value = null

  try {
    // Vérifier les dispos seulement si date ou heures ont changé
    const dateOrTimeChanged =
      editForm.date !== s.date ||
      editForm.startTime !== s.startTime ||
      editForm.endTime !== s.endTime

    if (dateOrTimeChanged || editForm.ingeId !== (s.ingeId ?? '')) {
      const conflict = await checkAvailability()
      if (conflict) {
        modalError.value = conflict
        saving.value = false
        return
      }
    }

    await updateSessionFields(s.id, {
      date: editForm.date,
      startTime: editForm.startTime,
      endTime: editForm.endTime,
      ...(editForm.ingeId ? { ingeId: editForm.ingeId } : {}),
    })
    emit('session-saved')
    closeModal()
  } catch (e: any) {
    modalError.value = e?.message ?? 'Erreur lors de la sauvegarde'
  } finally {
    saving.value = false
  }
}

async function cancelSession() {
  const s = selectedSession.value
  if (!s) return
  if (!confirm('Annuler cette session ? Cette action ne peut pas être annulée.')) return
  cancelling.value = true
  modalError.value = null
  try {
    await updateSessionStatus(s.id, 'cancelled')
    emit('session-cancelled')
    closeModal()
  } catch (e: any) {
    modalError.value = e?.message ?? "Erreur lors de l'annulation"
  } finally {
    cancelling.value = false
  }
}

const statusLabel: Record<string, string> = {
  waiting_payment: 'En attente de paiement',
  pending: 'À confirmer',
  confirmed: 'Confirmée',
  done: 'Terminée',
  cancelled: 'Annulée',
}

const statusClass: Record<string, string> = {
  waiting_payment: 'bg-orange-500/20 text-orange-200',
  pending: 'bg-amber-500/20 text-amber-200',
  confirmed: 'bg-emerald-500/20 text-emerald-200',
  done: 'bg-slate-500/25 text-slate-200',
  cancelled: 'bg-red-500/20 text-red-300',
}
</script>

<template>
  <div class="week-calendar">
    <!-- Navigation -->
    <div class="week-calendar-header flex flex-wrap items-center justify-between gap-2 pb-3">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded px-2 py-1.5 text-[var(--pds-primary)] hover:bg-[var(--pds-primary)]/10"
          @click="prevWeek"
        >
          ‹
        </button>
        <span
          class="min-w-0 shrink text-center text-sm font-medium text-[var(--pds-text)] sm:min-w-[120px] sm:text-base md:min-w-[140px]"
        >
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
          Aujourd'hui
        </button>
      </div>
    </div>

    <!-- Grille -->
    <div
      class="week-calendar-grid overflow-x-auto rounded-lg border border-[var(--pds-border)] bg-[var(--pds-border)]"
    >
      <div
        class="week-calendar-inner"
        :style="{
          '--week-total-hours': totalHours,
          display: 'grid',
          gridTemplateColumns: 'var(--week-time-width) repeat(7, minmax(0, 1fr))',
          gridTemplateRows: `repeat(var(--week-total-hours), var(--week-row-height)) var(--week-day-label-height)`,
          gridGap: '1px',
        }"
      >
        <template v-for="(h, hi) in hourLabels" :key="h">
          <div
            class="bg-[var(--pds-bg)] pr-1 pt-0.5 text-right text-xs text-[var(--pds-muted)]"
            :style="{ gridColumn: 1, gridRow: hi + 1 }"
          >
            {{ formatHourLabel(h) }}
          </div>
          <div
            v-for="(day, di) in weekDays"
            :key="`${day.dateStr}-${h}`"
            class="bg-[var(--pds-card)] min-w-0"
            :style="{ gridColumn: di + 2, gridRow: hi + 1 }"
          />
        </template>

        <!-- Libellés jour -->
        <div
          class="bg-[var(--pds-bg)]"
          :style="{ gridColumn: 1, gridRow: totalHours + 1 }"
          aria-hidden="true"
        />
        <div
          v-for="(day, i) in weekDays"
          :key="'label-' + day.dateStr"
          class="week-cell-day-label bg-[var(--pds-bg)] py-1.5 text-center text-xs font-medium text-[var(--pds-muted)]"
          :style="{ gridColumn: i + 2, gridRow: totalHours + 1 }"
        >
          {{ day.label }}
        </div>

        <!-- Blocs sessions -->
        <button
          v-for="s in sessionsInWeek"
          :key="s.id"
          type="button"
          class="week-calendar-session mx-0.5 my-0.5 overflow-hidden rounded border-l-4 py-1 px-1.5 text-[10px] cursor-pointer min-h-[28px] flex flex-col justify-center min-w-0 text-left w-full"
          :class="{
            'border-amber-500 bg-amber-500/25 text-amber-100': s.status === 'pending',
            'border-emerald-500 bg-emerald-500/25 text-emerald-100': s.status === 'confirmed',
            'border-slate-500 bg-slate-500/25 text-slate-300': s.status === 'done',
            'border-red-500/30 bg-red-500/15 text-red-200': s.status === 'cancelled',
            'border-orange-400/60 bg-orange-400/15 text-orange-200': s.status === 'waiting_payment',
          }"
          :style="{
            gridColumn: sessionGridPlace(s).gridColumn,
            gridRow: `${sessionGridPlace(s).gridRowStart} / ${sessionGridPlace(s).gridRowEnd}`,
          }"
          @click="openSession(s)"
        >
          <span class="font-medium leading-tight">{{ s.startTime }} – {{ s.endTime }}</span>
          <span class="truncate text-[9px] opacity-90">{{ resolveIngeName(s.ingeId) }}</span>
          <span class="truncate text-[9px] opacity-80">{{ resolveClientName(s) }}</span>
        </button>
      </div>
    </div>

    <!-- ── Modal ── -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="selectedSession"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
          @mousedown.self="closeModal"
        >
          <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />

          <div
            class="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-[#0f0f0f] p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            <!-- Header -->
            <div class="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3 class="font-['Raleway',sans-serif] text-[18px] font-semibold text-white">
                  Détail de la session
                </h3>
                <span
                  v-if="selectedSession.status"
                  class="mt-1 inline-block rounded-full px-2.5 py-0.5 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[11px] font-medium uppercase tracking-wide"
                  :class="statusClass[selectedSession.status] ?? 'bg-white/10 text-white/60'"
                >
                  {{ statusLabel[selectedSession.status] ?? selectedSession.status }}
                </span>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                aria-label="Fermer"
                @click="closeModal"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>

            <!-- Erreur -->
            <p
              v-if="modalError"
              class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm text-red-400"
            >
              {{ modalError }}
            </p>

            <div class="space-y-4">
              <!-- Date -->
              <div>
                <label class="mb-1.5 block font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[11px] uppercase tracking-[0.12em] text-white/45">
                  Date
                </label>
                <input
                  v-model="editForm.date"
                  type="date"
                  class="pds-modal-input w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm text-white focus:border-[#4a9eff]/60 focus:outline-none"
                />
              </div>

              <!-- Heures -->
              <div class="flex gap-3">
                <div class="flex-1">
                  <label class="mb-1.5 block font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[11px] uppercase tracking-[0.12em] text-white/45">
                    Début
                  </label>
                  <input
                    v-model="editForm.startTime"
                    type="time"
                    class="pds-modal-input w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm text-white focus:border-[#4a9eff]/60 focus:outline-none"
                  />
                </div>
                <div class="flex-1">
                  <label class="mb-1.5 block font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[11px] uppercase tracking-[0.12em] text-white/45">
                    Fin
                  </label>
                  <input
                    v-model="editForm.endTime"
                    type="time"
                    class="pds-modal-input w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm text-white focus:border-[#4a9eff]/60 focus:outline-none"
                  />
                </div>
              </div>

              <!-- Ingé son -->
              <div>
                <label class="mb-1.5 block font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[11px] uppercase tracking-[0.12em] text-white/45">
                  Ingénieur son
                </label>
                <select
                  v-if="ingeList && ingeList.length > 0"
                  v-model="editForm.ingeId"
                  class="pds-modal-input w-full rounded-lg border border-white/20 bg-[#0f0f0f] px-3 py-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm text-white focus:border-[#4a9eff]/60 focus:outline-none"
                >
                  <option value="">— Aucun —</option>
                  <option v-for="u in ingeList" :key="u.uid" :value="u.uid">
                    {{ u.email ?? u.uid }}
                  </option>
                </select>
                <p v-else class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm text-white/50">
                  {{ resolveIngeName(selectedSession.ingeId) }}
                </p>
              </div>

              <!-- Client (lecture seule) -->
              <div class="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                <p class="mb-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[11px] uppercase tracking-[0.12em] text-white/45">
                  Client
                </p>
                <div class="space-y-1 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm text-white/80">
                  <p class="font-medium text-white">{{ resolveClientName(selectedSession) }}</p>
                  <p v-if="selectedSession.bookerEmail" class="text-white/55">
                    {{ selectedSession.bookerEmail }}
                  </p>
                  <p v-if="selectedSession.bookerPhone" class="text-white/55">
                    {{ selectedSession.bookerPhone }}
                  </p>
                  <p v-if="selectedSession.style" class="text-xs text-white/40">
                    Style : {{ selectedSession.style }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                v-if="selectedSession.status !== 'cancelled'"
                type="button"
                class="rounded-full border border-red-500/40 px-4 py-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
                :disabled="cancelling || saving"
                @click="cancelSession"
              >
                {{ cancelling ? '…' : 'Annuler la session' }}
              </button>
              <div class="ml-auto flex gap-2">
                <button
                  type="button"
                  class="rounded-full border border-white/20 px-4 py-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm text-white/60 transition hover:text-white"
                  @click="closeModal"
                >
                  Fermer
                </button>
                <button
                  v-if="selectedSession.status !== 'cancelled'"
                  type="button"
                  class="rounded-full bg-gradient-to-r from-[#0073FF] to-[#64E8FF] px-5 py-2 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                  :disabled="saving || cancelling"
                  @click="saveSession"
                >
                  {{ saving ? 'Vérification…' : 'Sauvegarder' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.week-calendar-grid {
  min-height: 200px;
}
.week-calendar-inner {
  background: var(--pds-border);
  --week-row-height: 28px;
  --week-day-label-height: 32px;
  --week-time-width: 56px;
  min-width: min(100%, 720px);
}

@media (max-width: 639px) {
  .week-calendar-inner {
    --week-row-height: 22px;
    --week-day-label-height: 28px;
    --week-time-width: 44px;
    min-width: 560px;
  }
  .week-calendar-session {
    font-size: 9px;
    padding-left: 0.25rem;
    padding-right: 0.25rem;
  }
}
.week-cell-day-label {
  min-width: 0;
}
.week-calendar-session:hover {
  filter: brightness(1.15);
}
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.18s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.pds-modal-input::-webkit-calendar-picker-indicator {
  filter: invert(0.6);
  cursor: pointer;
}
</style>
