<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useSessions } from '../../composables/useSessions'
import { useSessionFiles } from '../../composables/useSessionFiles'
import { useAvailability, slotOverlapsAny } from '../../composables/useAvailability'
import { useAuth } from '../../composables/useAuth'
import { SLOT_START_HOUR, SLOT_END_HOUR } from '../../utils/pricing'
import type { TimeSlot } from '../../composables/useAvailability'
import type { Session } from '../../composables/useSessions'

const {
  sessions,
  listAllUpcoming,
  listAllPending,
  updateSessionStatus,
  loading: sessionsLoading,
} = useSessions()
const {
  files: sessionFiles,
  loading: filesLoading,
  error: filesError,
  listForSession,
  uploadForSession,
} = useSessionFiles()
const { setSlotsForDate, getMySlotsForDate } = useAvailability()
const { currentUser } = useAuth()

const selectedSessionId = ref<string | null>(null)
const selectedSessionLabel = computed(() => {
  const s = sessions.value.find((x) => x.id === selectedSessionId.value)
  if (!s) return ''
  return `${s.date} • ${s.startTime}-${s.endTime} • ${s.bookerEmail ?? s.bookerId}`
})

/** Sessions à venir uniquement celles confirmées par cet ingé (ingeId === currentUser) */
const myUpcomingSessions = computed(() => {
  const uid = currentUser.value?.uid
  if (!uid) return []
  return sessions.value.filter((s) => s.ingeId === uid)
})
const uploadError = ref<string | null>(null)
const uploadSuccess = ref<string | null>(null)

const sessionsToConfirm = ref<Session[]>([])
const loadingSessionsToConfirm = ref(false)
const confirmingId = ref<string | null>(null)

const availabilityMonth = ref(new Date())
const availabilityDate = ref<string>('')
const slotsForSelectedDate = ref<TimeSlot[]>([])
const loadingSlots = ref(false)
const savingSlots = ref(false)
const addSlotStart = ref(10)
const addSlotEnd = ref(12)

const hourOptions = computed(() => {
  const h: number[] = []
  for (let i = SLOT_START_HOUR; i <= SLOT_END_HOUR; i++) h.push(i)
  return h
})

const availabilityCalendarDays = computed(() => {
  const y = availabilityMonth.value.getFullYear()
  const m = availabilityMonth.value.getMonth()
  const first = new Date(y, m, 1)
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)
  const days: { day: number | null; dateStr: string; disabled: boolean }[] = []
  for (let i = 0; i < startOffset; i++) days.push({ day: null, dateStr: '', disabled: true })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({ day: d, dateStr, disabled: dateStr < today })
  }
  return days
})

const availabilityMonthLabel = computed(() => {
  const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
  return `${months[availabilityMonth.value.getMonth()]} ${availabilityMonth.value.getFullYear()}`
})

async function loadSessionsToConfirm() {
  loadingSessionsToConfirm.value = true
  try {
    const pending = await listAllPending()
    const filtered: Session[] = []
    for (const s of pending) {
      const mySlots = await getMySlotsForDate(s.date)
      const sessionSlot = { start: s.startTime, end: s.endTime }
      if (slotOverlapsAny(sessionSlot, mySlots)) filtered.push(s)
    }
    sessionsToConfirm.value = filtered
  } finally {
    loadingSessionsToConfirm.value = false
  }
}

async function confirmSession(sessionId: string) {
  const uid = currentUser.value?.uid
  if (!uid) return
  confirmingId.value = sessionId
  try {
    await updateSessionStatus(sessionId, 'confirmed', undefined, uid)
    sessionsToConfirm.value = sessionsToConfirm.value.filter((s) => s.id !== sessionId)
    await listAllUpcoming()
  } finally {
    confirmingId.value = null
  }
}

onMounted(async () => {
  await loadSessionsToConfirm()
  await listAllUpcoming()
})

watch(availabilityDate, async (d) => {
  if (!d) { slotsForSelectedDate.value = []; return }
  loadingSlots.value = true
  try {
    slotsForSelectedDate.value = await getMySlotsForDate(d)
    addSlotStart.value = SLOT_START_HOUR
    addSlotEnd.value = SLOT_START_HOUR + 2
  } finally {
    loadingSlots.value = false
  }
})

function prevAvailabilityMonth() {
  availabilityMonth.value = new Date(availabilityMonth.value.getFullYear(), availabilityMonth.value.getMonth() - 1, 1)
}
function nextAvailabilityMonth() {
  availabilityMonth.value = new Date(availabilityMonth.value.getFullYear(), availabilityMonth.value.getMonth() + 1, 1)
}
function selectAvailabilityDate(dateStr: string) {
  if (!dateStr) return
  availabilityDate.value = dateStr
}
function fmtHour(h: number) {
  return `${h.toString().padStart(2, '0')}:00`
}
function addSlot() {
  const start = fmtHour(addSlotStart.value)
  const end = fmtHour(addSlotEnd.value)
  if (addSlotEnd.value <= addSlotStart.value) return
  slotsForSelectedDate.value = [...slotsForSelectedDate.value, { start, end }]
}
function removeSlot(index: number) {
  slotsForSelectedDate.value = slotsForSelectedDate.value.filter((_, i) => i !== index)
}
async function saveSlots() {
  if (!availabilityDate.value) return
  savingSlots.value = true
  try {
    await setSlotsForDate(availabilityDate.value, slotsForSelectedDate.value, 'inge')
  } finally {
    savingSlots.value = false
  }
}

const handleSelectSession = async (sessionId: string) => {
  selectedSessionId.value = sessionId
  uploadError.value = null
  uploadSuccess.value = null
  await listForSession(sessionId)
}

const handleFilesChange = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !selectedSessionId.value) return
  uploadError.value = null
  uploadSuccess.value = null
  try {
    await uploadForSession(selectedSessionId.value, file)
    uploadSuccess.value = 'Fichier uploadé avec succès.'
  } catch (err: any) {
    uploadError.value = err?.message ?? 'Erreur lors de l’upload.'
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="pds-h2">
      Espace ingé son – sessions & pistes
    </h2>

    <div class="pds-card space-y-3">
      <h3 class="pds-subtitle">
        Sessions à confirmer (tes dispos correspondent)
      </h3>
      <p class="text-sm text-[var(--pds-muted)]">
        Ces réservations correspondent à tes créneaux. Confirme pour les valider.
      </p>
      <div v-if="loadingSessionsToConfirm" class="text-sm text-[var(--pds-muted)]">
        Chargement...
      </div>
      <div v-else-if="sessionsToConfirm.length === 0" class="text-sm text-[var(--pds-muted)]">
        Aucune session en attente sur tes créneaux.
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="s in sessionsToConfirm"
          :key="s.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--pds-border)] bg-[var(--pds-bg)] p-3"
        >
          <div>
            <p class="font-medium">{{ s.date }} • {{ s.startTime }} – {{ s.endTime }}</p>
            <p class="text-xs text-[var(--pds-muted)]">{{ s.bookerEmail ?? s.bookerId }} · {{ s.style }}</p>
          </div>
          <button
            type="button"
            class="btn-primary !py-2 !px-3 !text-sm"
            :disabled="confirmingId === s.id"
            @click="confirmSession(s.id)"
          >
            {{ confirmingId === s.id ? 'Confirmation...' : 'Confirmer la session' }}
          </button>
        </div>
      </div>
    </div>

    <div class="pds-card space-y-3">
      <h3 class="pds-subtitle">
        Calendrier semaine
      </h3>
      <WeekCalendar :sessions="myUpcomingSessions" />
    </div>

    <div class="pds-card space-y-3">
      <h3 class="pds-subtitle">
        Sessions à venir
      </h3>
      <div v-if="sessionsLoading" class="text-sm text-[var(--pds-muted)]">
        Chargement des sessions...
      </div>
      <div v-else-if="myUpcomingSessions.length === 0" class="text-sm text-[var(--pds-muted)]">
        Aucune session à venir pour le moment.
      </div>
      <div v-else class="space-y-2">
        <button
          v-for="s in myUpcomingSessions"
          :key="s.id"
          type="button"
          class="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors"
          :class="[
            selectedSessionId === s.id
              ? 'border-[var(--pds-primary)] bg-[var(--pds-primary)]/10'
              : 'border-[var(--pds-border)] bg-[var(--pds-bg)] hover:border-[var(--pds-primary)]',
          ]"
          @click="handleSelectSession(s.id)"
        >
          <div class="space-y-0.5">
            <p class="font-medium text-slate-100">
              {{ s.date }} • {{ s.startTime }} – {{ s.endTime }}
            </p>
            <p class="text-[10px] text-slate-300">
              Booker: {{ s.bookerEmail || s.bookerId }} · Style: {{ s.style }}
            </p>
          </div>
          <span
            class="rounded-full px-2 py-0.5 text-[10px]"
            :class="{
              'bg-amber-500/20 text-amber-300': s.status === 'pending',
              'bg-emerald-500/20 text-emerald-300': s.status === 'confirmed',
              'bg-slate-500/20 text-slate-300': s.status === 'done',
              'bg-red-500/20 text-red-300': s.status === 'cancelled',
            }"
          >
            {{ s.status }}
          </span>
        </button>
      </div>
    </div>

    <!-- Mes disponibilités -->
    <div class="pds-card space-y-4">
      <h3 class="pds-subtitle">
        Mes disponibilités
      </h3>
      <p class="text-sm text-[var(--pds-muted)]">
        Choisis une date puis ajoute des créneaux (ex. 10h–14h). Les bookers ne verront que les dates où tu es dispo.
      </p>
      <div class="flex items-center justify-between">
        <button type="button" class="rounded px-2 py-1 text-[var(--pds-primary)] hover:bg-[var(--pds-primary)]/10" @click="prevAvailabilityMonth">‹</button>
        <span class="font-medium text-[var(--pds-text)]">{{ availabilityMonthLabel }}</span>
        <button type="button" class="rounded px-2 py-1 text-[var(--pds-primary)] hover:bg-[var(--pds-primary)]/10" @click="nextAvailabilityMonth">›</button>
      </div>
      <div class="grid grid-cols-7 gap-1 sm:gap-2">
        <div v-for="(lab, di) in ['L','M','M','J','V','S','D']" :key="di" class="text-center text-xs text-[var(--pds-muted)]">{{ lab }}</div>
        <button
          v-for="(cell, idx) in availabilityCalendarDays"
          :key="idx"
          type="button"
          class="flex aspect-square items-center justify-center rounded-lg border text-sm transition-colors"
          :class="{
            'border-transparent bg-transparent': cell.day == null,
            'cursor-not-allowed opacity-40': cell.disabled && cell.day != null,
            'border-[var(--pds-primary)] bg-[var(--pds-primary)] text-white': availabilityDate === cell.dateStr,
            'border-[var(--pds-border)] bg-[var(--pds-bg)] hover:border-[var(--pds-primary)]': cell.day != null && !cell.disabled && availabilityDate !== cell.dateStr
          }"
          :disabled="cell.day == null || cell.disabled"
          @click="selectAvailabilityDate(cell.dateStr)"
        >
          {{ cell.day ?? '' }}
        </button>
      </div>
      <div v-if="availabilityDate" class="border-t border-[var(--pds-border)] pt-4">
        <p class="mb-2 text-sm text-[var(--pds-text)]">
          Créneaux le {{ availabilityDate }}
        </p>
        <div v-if="loadingSlots" class="text-sm text-[var(--pds-muted)]">Chargement...</div>
        <template v-else>
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <select v-model.number="addSlotStart" class="pds-input w-20">
              <option v-for="h in hourOptions" :key="h" :value="h">{{ h }}h</option>
            </select>
            <span>→</span>
            <select v-model.number="addSlotEnd" class="pds-input w-20">
              <option v-for="h in hourOptions" :key="h" :value="h">{{ h }}h</option>
            </select>
            <button type="button" class="btn-primary !py-2 !px-3 !text-sm" @click="addSlot">Ajouter</button>
          </div>
          <ul class="mb-3 space-y-2">
            <li
              v-for="(slot, i) in slotsForSelectedDate"
              :key="i"
              class="flex items-center justify-between rounded-lg border border-[var(--pds-border)] bg-[var(--pds-bg)] px-3 py-2 text-sm"
            >
              <span>{{ slot.start }} – {{ slot.end }}</span>
              <button type="button" class="text-red-400 hover:underline" @click="removeSlot(i)">Supprimer</button>
            </li>
          </ul>
          <button type="button" class="btn-primary !py-2 !px-3 !text-sm" :disabled="savingSlots" @click="saveSlots">
            {{ savingSlots ? 'Enregistrement...' : 'Enregistrer les créneaux' }}
          </button>
        </template>
      </div>
    </div>

    <div v-if="selectedSessionId" class="pds-card space-y-3">
      <h3 class="pds-subtitle">
        Pistes de la session
      </h3>
      <p class="text-sm text-[var(--pds-muted)]">
        Session sélectionnée:
        <span class="font-medium text-[var(--pds-text)]">{{ selectedSessionLabel }}</span>
      </p>
      <div class="form-group">
        <label class="pds-label">Uploader une piste (stereo mix, stems, etc.)</label>
        <input
          type="file"
          class="w-full text-sm text-[var(--pds-text)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--pds-primary)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
          @change="handleFilesChange"
        >
      </div>
      <p v-if="uploadError || filesError" class="text-sm text-red-400">
        {{ uploadError || filesError }}
      </p>
      <p v-if="uploadSuccess" class="text-sm text-emerald-400">
        {{ uploadSuccess }}
      </p>
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="pds-label mb-0">
            Fichiers uploadés
          </h4>
          <span v-if="filesLoading" class="text-xs text-[var(--pds-muted)]">
            Chargement...
          </span>
        </div>
        <div
          v-if="!filesLoading && sessionFiles.length === 0"
          class="text-sm text-[var(--pds-muted)]"
        >
          Aucun fichier pour cette session.
        </div>
        <ul v-else class="space-y-1 text-sm">
          <li
            v-for="f in sessionFiles"
            :key="f.id"
            class="flex items-center justify-between rounded-lg border border-[var(--pds-border)] bg-[var(--pds-bg)] px-3 py-2"
          >
            <div class="space-y-0.5">
              <p class="font-medium text-slate-100">{{ f.fileName }}</p>
                <a
                  :href="f.url"
                  target="_blank"
                  rel="noreferrer"
                  class="text-sm text-[var(--pds-primary)] hover:underline"
                >
                  Télécharger / ouvrir
                </a>
            </div>
            <span class="text-xs text-[var(--pds-muted)]">
              {{ f.createdAt.toLocaleDateString() }}
            </span>
          </li>
        </ul>
      </div>
      <p class="mt-2 text-xs text-[var(--pds-muted)]">
        Plus tard, on déclenchera ici le paiement du reste avant de donner
        l’accès définitif aux pistes.
      </p>
    </div>
  </div>
</template>
