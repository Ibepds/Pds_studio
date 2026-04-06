<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSessions } from '../../composables/useSessions'

/** Afficher uniquement certaines sections (pour les pages par feature) */
const props = withDefaults(
  defineProps<{ mode?: 'calendrier' | 'prods' | 'disponibilites' | 'sessions' | 'all' }>(),
  { mode: 'all' },
)
const showCalendrier = computed(() => props.mode === 'calendrier' || props.mode === 'all')
const showProds = computed(() => props.mode === 'prods' || props.mode === 'all')
const showDisponibilites = computed(() => props.mode === 'disponibilites' || props.mode === 'all')
const showSessions = computed(() => props.mode === 'sessions' || props.mode === 'all')
import { useBeats } from '../../composables/useBeats'
import { useAvailability } from '../../composables/useAvailability'
import { SLOT_START_HOUR, SLOT_END_HOUR } from '../../utils/pricing'
import type { TimeSlot } from '../../composables/useAvailability'

const { sessions, listForCurrentBeatmaker, loading: sessionsLoading } = useSessions()
const {
  myBeats,
  loading: beatsLoading,
  error: beatsError,
  subscribeMyBeats,
  uploadBeat,
  deleteBeat,
} = useBeats()
const { setSlotsForDate, getMySlotsForDate } = useAvailability()

const beatUploadTitle = ref('')
const beatUploadStyle = ref('Trap')
const beatUploadBpm = ref<number | null>(null)
const beatUploadPrice = ref<number | null>(null)
const beatUploadIsPublic = ref(true)
const beatUploadFile = ref<File | null>(null)
const beatUploadError = ref<string | null>(null)
const beatUploadSuccess = ref<string | null>(null)
const beatmakerTab = ref<'list' | 'delete'>('list')
const deletingBeatId = ref<string | null>(null)
let unsubscribeMyBeats: (() => void) | null = null

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
  const months = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ]
  return `${months[availabilityMonth.value.getMonth()]} ${availabilityMonth.value.getFullYear()}`
})

watch(availabilityDate, async (d) => {
  if (!d) {
    slotsForSelectedDate.value = []
    return
  }
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
  availabilityMonth.value = new Date(
    availabilityMonth.value.getFullYear(),
    availabilityMonth.value.getMonth() - 1,
    1,
  )
}
function nextAvailabilityMonth() {
  availabilityMonth.value = new Date(
    availabilityMonth.value.getFullYear(),
    availabilityMonth.value.getMonth() + 1,
    1,
  )
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
    await setSlotsForDate(availabilityDate.value, slotsForSelectedDate.value, 'beatmaker')
  } finally {
    savingSlots.value = false
  }
}

onMounted(async () => {
  unsubscribeMyBeats = subscribeMyBeats()
  await listForCurrentBeatmaker()
})

onUnmounted(() => {
  if (unsubscribeMyBeats) {
    unsubscribeMyBeats()
    unsubscribeMyBeats = null
  }
})

const handleBeatFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  beatUploadFile.value = input.files?.[0] || null
}

const handleBeatUpload = async () => {
  beatUploadError.value = null
  beatUploadSuccess.value = null
  if (!beatUploadFile.value) {
    beatUploadError.value = 'Choisis un fichier audio.'
    return
  }
  try {
    await uploadBeat(beatUploadFile.value, {
      title: beatUploadTitle.value || beatUploadFile.value.name,
      style: beatUploadStyle.value,
      bpm: beatUploadBpm.value ?? undefined,
      price: beatUploadPrice.value ?? undefined,
      isPublic: beatUploadIsPublic.value,
    })
    beatUploadSuccess.value = 'Prod uploadée avec succès.'
    beatUploadTitle.value = ''
    beatUploadBpm.value = null
    beatUploadPrice.value = null
    beatUploadIsPublic.value = true
    beatUploadFile.value = null
  } catch (e: any) {
    beatUploadError.value = e?.message ?? 'Erreur lors de l’upload.'
  }
}

const handleDeleteBeat = async (beatId: string) => {
  if (!confirm('Supprimer cette prod ?')) return
  deletingBeatId.value = beatId
  try {
    await deleteBeat(beatId)
  } catch (e: any) {
    beatUploadError.value = e?.message ?? 'Erreur lors de la suppression.'
  } finally {
    deletingBeatId.value = null
  }
}
</script>

<template>
  <div class="min-w-0 space-y-6 overflow-x-clip">
    <h2 v-if="mode === 'all'" class="pds-h2">Espace beatmaker – prods & sessions</h2>

    <div v-if="showCalendrier" class="pds-card min-w-0 space-y-3">
      <h3 class="pds-subtitle">Calendrier semaine</h3>
      <WeekCalendar :sessions="sessions" />
    </div>

    <div v-if="showProds" class="flex gap-2 border-b border-[var(--pds-border)] pb-2">
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        :class="
          beatmakerTab === 'list'
            ? 'bg-[var(--pds-primary)]/20 text-[var(--pds-primary)]'
            : 'text-[var(--pds-muted)] hover:text-[var(--pds-text)]'
        "
        @click="beatmakerTab = 'list'"
      >
        Mes prods
      </button>
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        :class="
          beatmakerTab === 'delete'
            ? 'bg-[var(--pds-primary)]/20 text-[var(--pds-primary)]'
            : 'text-[var(--pds-muted)] hover:text-[var(--pds-text)]'
        "
        @click="beatmakerTab = 'delete'"
      >
        Supprimer
      </button>
    </div>

    <!-- Mes disponibilités -->
    <div v-if="showDisponibilites" class="pds-card min-w-0 space-y-4">
      <h3 class="pds-subtitle">Mes disponibilités</h3>
      <p class="text-sm text-[var(--pds-muted)]">
        Choisis une date puis ajoute des créneaux. Les bookers ne verront que les dates où tu es
        dispo.
      </p>
      <div class="flex items-center justify-between">
        <button
          type="button"
          class="rounded px-2 py-1 text-[var(--pds-primary)] hover:bg-[var(--pds-primary)]/10"
          @click="prevAvailabilityMonth"
        >
          ‹
        </button>
        <span class="font-medium text-[var(--pds-text)]">{{ availabilityMonthLabel }}</span>
        <button
          type="button"
          class="rounded px-2 py-1 text-[var(--pds-primary)] hover:bg-[var(--pds-primary)]/10"
          @click="nextAvailabilityMonth"
        >
          ›
        </button>
      </div>
      <div class="grid grid-cols-7 gap-1 sm:gap-2">
        <div
          v-for="(lab, di) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']"
          :key="di"
          class="text-center text-xs text-[var(--pds-muted)]"
        >
          {{ lab }}
        </div>
        <button
          v-for="(cell, idx) in availabilityCalendarDays"
          :key="idx"
          type="button"
          class="flex aspect-square items-center justify-center rounded-lg border text-sm transition-colors"
          :class="{
            'border-transparent bg-transparent': cell.day == null,
            'cursor-not-allowed opacity-40': cell.disabled && cell.day != null,
            'border-[var(--pds-primary)] bg-[var(--pds-primary)] text-white':
              availabilityDate === cell.dateStr,
            'border-[var(--pds-border)] bg-[var(--pds-bg)] hover:border-[var(--pds-primary)]':
              cell.day != null && !cell.disabled && availabilityDate !== cell.dateStr,
          }"
          :disabled="cell.day == null || cell.disabled"
          @click="selectAvailabilityDate(cell.dateStr)"
        >
          {{ cell.day ?? '' }}
        </button>
      </div>
      <div v-if="availabilityDate" class="border-t border-[var(--pds-border)] pt-4">
        <p class="mb-2 text-sm text-[var(--pds-text)]">Créneaux le {{ availabilityDate }}</p>
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
            <button type="button" class="btn-primary !py-2 !px-3 !text-sm" @click="addSlot">
              Ajouter
            </button>
          </div>
          <ul class="mb-3 space-y-2">
            <li
              v-for="(slot, i) in slotsForSelectedDate"
              :key="i"
              class="flex items-center justify-between rounded-lg border border-[var(--pds-border)] bg-[var(--pds-bg)] px-3 py-2 text-sm"
            >
              <span>{{ slot.start }} – {{ slot.end }}</span>
              <button type="button" class="text-red-400 hover:underline" @click="removeSlot(i)">
                Supprimer
              </button>
            </li>
          </ul>
          <button
            type="button"
            class="btn-primary !py-2 !px-3 !text-sm"
            :disabled="savingSlots"
            @click="saveSlots"
          >
            {{ savingSlots ? 'Enregistrement...' : 'Enregistrer les créneaux' }}
          </button>
        </template>
      </div>
    </div>

    <template v-if="showProds">
      <template v-if="beatmakerTab === 'list'">
        <div class="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-300">
            Uploader une nouvelle prod
          </h3>
          <div class="space-y-3">
            <div class="space-y-2">
              <div class="space-y-1">
                <label class="block text-[11px] font-medium text-slate-200">Titre</label>
                <input
                  v-model="beatUploadTitle"
                  type="text"
                  placeholder="Nom de la prod"
                  class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-sky-500"
                />
              </div>
              <div class="space-y-1">
                <label class="block text-[11px] font-medium text-slate-200">Style</label>
                <select
                  v-model="beatUploadStyle"
                  class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-sky-500"
                >
                  <option value="Trap">Trap</option>
                  <option value="Drill">Drill</option>
                  <option value="Afro">Afro</option>
                  <option value="RnB">RnB</option>
                  <option value="Boom Bap">Boom Bap</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="space-y-1">
                  <label class="block text-[11px] font-medium text-slate-200">BPM</label>
                  <input
                    v-model.number="beatUploadBpm"
                    type="number"
                    min="40"
                    max="220"
                    class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-sky-500"
                  />
                </div>
                <div class="space-y-1">
                  <label class="block text-[11px] font-medium text-slate-200">Prix (€)</label>
                  <input
                    v-model.number="beatUploadPrice"
                    type="number"
                    min="0"
                    step="1"
                    class="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-sky-500"
                  />
                </div>
              </div>
              <div class="space-y-1">
                <label class="block text-[11px] font-medium text-slate-200">Fichier audio</label>
                <input
                  type="file"
                  accept="audio/*"
                  class="w-full text-[11px] text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-sky-500 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-950 hover:file:bg-sky-400"
                  @change="handleBeatFileChange"
                />
              </div>
              <label class="inline-flex items-center gap-2 text-[11px] text-slate-300">
                <input
                  v-model="beatUploadIsPublic"
                  type="checkbox"
                  class="h-3 w-3 rounded border-slate-600 bg-slate-900 text-sky-500"
                />
                Rendre la prod visible pour les bookers
              </label>
            </div>
            <p v-if="beatUploadError || beatsError" class="text-[11px] text-red-400">
              {{ beatUploadError || beatsError }}
            </p>
            <p v-if="beatUploadSuccess" class="text-[11px] text-emerald-400">
              {{ beatUploadSuccess }}
            </p>
            <button
              class="inline-flex items-center justify-center rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50"
              :disabled="beatsLoading"
              @click="handleBeatUpload"
            >
              Upload la prod
            </button>
          </div>
        </div>

        <div class="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-300">Tes prods</h3>
          <p class="text-[10px] text-slate-400">
            La liste se met à jour automatiquement après un upload ou une suppression.
          </p>
          <div v-if="myBeats.length === 0" class="text-[11px] text-slate-400">
            Tu n’as pas encore uploadé de prod.
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="b in myBeats"
              :key="b.id"
              class="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="min-w-0 space-y-0.5">
                <p class="text-[11px] font-medium text-slate-100">
                  {{ b.title }}
                  <span
                    class="ml-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide"
                  >
                    {{ b.style }}
                  </span>
                </p>
                <p class="text-[10px] text-slate-400">
                  BPM: {{ b.bpm || '–' }} · Prix: {{ b.price || '–' }} €
                </p>
              </div>
              <a
                :href="b.url"
                target="_blank"
                rel="noreferrer"
                class="shrink-0 text-[10px] text-sky-400 hover:text-sky-300"
              >
                Écouter / télécharger
              </a>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="beatmakerTab === 'delete'">
        <div class="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-300">
            Supprimer une prod
          </h3>
          <p class="text-[11px] text-slate-400">
            Choisis une prod à supprimer. La liste est synchronisée en temps réel.
          </p>
          <div v-if="myBeats.length === 0" class="text-[11px] text-slate-400">
            Tu n’as pas de prod à supprimer.
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="b in myBeats"
              :key="b.id"
              class="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="min-w-0 space-y-0.5">
                <p class="text-[11px] font-medium text-slate-100">
                  {{ b.title }}
                  <span
                    class="ml-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide"
                  >
                    {{ b.style }}
                  </span>
                </p>
                <p class="text-[10px] text-slate-400">
                  BPM: {{ b.bpm || '–' }} · Prix: {{ b.price || '–' }} €
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-lg border border-red-500/50 px-2 py-1 text-[10px] font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                :disabled="deletingBeatId === b.id"
                @click="handleDeleteBeat(b.id)"
              >
                {{ deletingBeatId === b.id ? 'Suppression…' : 'Supprimer' }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </template>

    <div
      v-if="showSessions"
      class="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
    >
      <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-300">
        Sessions avec tes prods
      </h3>
      <div v-if="sessionsLoading" class="text-[11px] text-slate-400">
        Chargement des sessions...
      </div>
      <div v-else-if="sessions.length === 0" class="text-[11px] text-slate-400">
        Aucune session ne référence encore tes prods.
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="s in sessions"
          :key="s.id"
          class="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0 space-y-0.5">
            <p class="text-[11px] font-medium text-slate-100">
              {{ s.date }} • {{ s.startTime }} – {{ s.endTime }}
            </p>
            <p class="text-[10px] text-slate-300">
              Booker: {{ s.bookerEmail || s.bookerId }} · Prod: {{ s.beatTitle || '—' }}
            </p>
          </div>
          <span
            class="shrink-0 self-start rounded-full px-2 py-0.5 text-[10px] sm:self-center"
            :class="{
              'bg-amber-500/20 text-amber-300': s.status === 'pending',
              'bg-emerald-500/20 text-emerald-300': s.status === 'confirmed',
              'bg-slate-500/20 text-slate-300': s.status === 'done',
              'bg-red-500/20 text-red-300': s.status === 'cancelled',
            }"
          >
            {{ s.status }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
