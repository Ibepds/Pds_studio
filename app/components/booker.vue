<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useSessions } from '../../composables/useSessions'
import { useBeats } from '../../composables/useBeats'
import { useBookerProdUpload } from '../../composables/useBookerProdUpload'
import { usePaypal } from '../../composables/usePaypal'
import { useAuth } from '../../composables/useAuth'
import { filterOutBookedSlots, type SessionBlock } from '../../composables/useAvailability'
import { getAvailableStartHours } from '../../utils/pricing'
import {
  DURATION_OPTIONS,
  getDeposit,
  getTotalPrice,
} from '../../utils/pricing'

const {
  sessions,
  groupedByDate,
  listForCurrentBooker,
  listSessionsForDate,
  bookSession,
  updateSessionStatus,
  loading: sessionsLoading,
  error: sessionsError,
} = useSessions()
const { listAllPublic, beats } = useBeats()
const { upload: uploadBookerProd } = useBookerProdUpload()
const { currentUser } = useAuth()

const durationHours = ref<number | null>(null)
const date = ref<string>('')
const startHour = ref<number | null>(null)
const style = ref<string>('Trap')
const selectedBeatId = ref<string>('')
const selectedBeatOwnerId = ref<string>('')
const bookerProdFile = ref<File | null>(null)
const localError = ref<string | null>(null)
const success = ref<string | null>(null)
const uploadingProd = ref(false)

const calendarMonth = ref(new Date())
const availableStartHoursList = ref<number[]>([])
const loadingSlots = ref(false)

const paypalError = ref<string | null>(null)
const paypalRenderedFor = ref<string | null>(null)

onMounted(() => {
  listAllPublic()
})

watch(
  () => currentUser.value?.uid,
  (uid) => {
    if (uid) listForCurrentBooker()
  },
  { immediate: true },
)

const canChooseDate = computed(() => durationHours.value != null)

const selectedDate = computed(() => (date.value ? new Date(date.value + 'T12:00:00') : null))
const totalPrice = computed(() =>
  selectedDate.value && durationHours.value
    ? getTotalPrice(selectedDate.value, durationHours.value)
    : 0,
)
const depositAmount = computed(() => getDeposit(totalPrice.value))

const summaryTimeRange = computed(() => {
  if (startHour.value == null || !durationHours.value) return ''
  const end = startHour.value + durationHours.value
  return `${startHour.value}h – ${end}h`
})

const canBook = computed(
  () =>
    !!(
      date.value &&
      durationHours.value &&
      startHour.value != null &&
      totalPrice.value > 0
    ),
)

async function loadAvailableSlots() {
  const d = date.value
  const dur = durationHours.value
  if (!d || dur == null) {
    availableStartHoursList.value = []
    return
  }
  loadingSlots.value = true
  try {
    const hours = getAvailableStartHours(dur)
    const booked = await listSessionsForDate(d)
    const blocks: SessionBlock[] = booked.map((s) => ({
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
    }))
    availableStartHoursList.value = filterOutBookedSlots(hours, d, dur, blocks)
    if (startHour.value != null && !availableStartHoursList.value.includes(startHour.value)) {
      startHour.value = null
    }
  } catch {
    availableStartHoursList.value = []
  } finally {
    loadingSlots.value = false
  }
}

watch(
  [date, durationHours],
  () => { loadAvailableSlots() },
  { immediate: true },
)

const calendarDays = computed(() => {
  const y = calendarMonth.value.getFullYear()
  const m = calendarMonth.value.getMonth()
  const first = new Date(y, m, 1)
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)
  const days: { day: number | null; dateStr: string; disabled: boolean; available: boolean }[] = []
  for (let i = 0; i < startOffset; i++) {
    days.push({ day: null, dateStr: '', disabled: true, available: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const disabled = dateStr < today
    days.push({ day, dateStr, disabled, available: !disabled })
  }
  return days
})

const calendarMonthLabel = computed(() => {
  const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
  return `${months[calendarMonth.value.getMonth()]} ${calendarMonth.value.getFullYear()}`
})

function prevMonth() {
  calendarMonth.value = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth() - 1, 1)
}

function nextMonth() {
  calendarMonth.value = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth() + 1, 1)
}

function selectCalendarDate(dateStr: string) {
  if (!dateStr) return
  date.value = dateStr
  loadAvailableSlots()
}

function formatHour(h: number) {
  return `${h.toString().padStart(2, '0')}:00`
}

function handleBookerProdFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  bookerProdFile.value = f || null
  if (f) selectedBeatId.value = ''
}

function handleBeatSelect() {
  bookerProdFile.value = null
}

const handleBook = async () => {
  localError.value = null
  success.value = null
  if (!canBook.value) {
    localError.value = 'Choisis la durée, la date et l’heure.'
    return
  }
  try {
    let bookerProdUrl: string | undefined
    let bookerProdFileName: string | undefined
    if (bookerProdFile.value) {
      uploadingProd.value = true
      try {
        const res = await uploadBookerProd(bookerProdFile.value)
        bookerProdUrl = res.url
        bookerProdFileName = res.fileName
      } finally {
        uploadingProd.value = false
      }
    }
    const selectedBeat = selectedBeatId.value ? beats.value.find((b) => b.id === selectedBeatId.value) : null
    const startTime = formatHour(startHour.value!)
    const endTime = formatHour(startHour.value! + durationHours.value!)
    await bookSession({
      date: date.value,
      startTime,
      endTime,
      style: style.value,
      beatId: selectedBeat?.id,
      beatTitle: selectedBeat?.title,
      beatmakerId: selectedBeat?.ownerId,
      bookerProdUrl,
      bookerProdFileName,
      durationHours: durationHours.value!,
      totalPrice: totalPrice.value,
      depositAmount: depositAmount.value,
    })
    success.value = 'Session réservée. Payer l’acompte ci‑dessous.'
    durationHours.value = null
    date.value = ''
    startHour.value = null
    selectedBeatId.value = ''
    selectedBeatOwnerId.value = ''
    bookerProdFile.value = null
    await listForCurrentBooker()
  } catch (e: any) {
    localError.value = e?.message ?? 'Erreur lors de la réservation.'
    uploadingProd.value = false
  }
}

const initPaypalBooking = async (sessionId: string, deposit: number) => {
  paypalError.value = null
  success.value = null
  try {
    // Récupérer le chargeur au clic (côté client) pour éviter le contexte SSR
    const loadPaypalFn = usePaypal()
    const paypal = await loadPaypalFn()
    if (!paypal) throw new Error('PayPal non disponible')
    if (paypalRenderedFor.value === sessionId) return
    const valueApi = (typeof deposit === 'number' ? deposit : 50).toFixed(2)
    paypal.Buttons({
      createOrder: (_data: any, actions: any) =>
        actions.order.create({
          purchase_units: [{
            amount: { value: valueApi, currency_code: 'EUR' },
            description: 'Acompte 30% — réservation session studio PDS',
          }],
        }),
      onApprove: async (data: any, actions: any) => {
        await actions.order.capture()
        const orderId = data?.orderID
        success.value = 'Paiement PayPal effectué, la session est confirmée.'
        try {
          await updateSessionStatus(sessionId, 'confirmed', orderId)
        } catch (e) {
          console.error(e)
        }
      },
      onError: () => {
        paypalError.value = 'Erreur lors du paiement PayPal.'
      },
    }).render(`#paypal-button-${sessionId}`)
    paypalRenderedFor.value = sessionId
  } catch (e: any) {
    paypalError.value = e?.message ?? 'Impossible de charger PayPal.'
  }
}

const depositForSession = (s: any) => s.depositAmount ?? Math.round((s.totalPrice ?? 50) * 0.3)
</script>

<template>
  <div class="space-y-8">
    <h2 class="pds-h2">
      Réserver une session
    </h2>

    <!-- Tarifs -->
    <div class="pds-card">
      <div class="price-line mb-2 text-lg text-[var(--pds-text)]">
        <strong class="text-[var(--pds-primary)]">50€</strong> / heure en semaine
      </div>
      <div class="price-line mb-2 text-lg text-[var(--pds-text)]">
        <strong class="text-[var(--pds-primary)]">60€</strong> / heure le week-end
      </div>
      <p class="location-info mt-4 text-sm leading-relaxed text-[var(--pds-muted2)]">
        Studio situé en banlieue ouest parisienne.<br>
        L'adresse sera envoyée après confirmation.
      </p>
    </div>

    <!-- Durée (2h à 12h) -->
    <div>
      <h3 class="pds-subtitle mb-4">
        Combien d’heures souhaitez-vous réserver ? (2h minimum)
      </h3>
      <select v-model="durationHours" class="pds-input w-full max-w-xs">
        <option :value="null">
          Choisir
        </option>
        <option v-for="h in DURATION_OPTIONS" :key="h" :value="h">
          {{ h }} heure{{ h > 1 ? 's' : '' }}
        </option>
      </select>
    </div>

    <!-- Calendrier -->
    <div v-if="canChooseDate" class="space-y-3">
      <h3 class="pds-subtitle">
        Choisissez une date
      </h3>
      <div class="pds-card p-4">
        <div class="calendar-header mb-4 flex items-center justify-between">
          <button
            type="button"
            class="rounded px-2 py-1 text-[var(--pds-primary)] hover:bg-[var(--pds-primary)]/10"
            @click="prevMonth"
          >
            ‹
          </button>
          <span class="font-medium text-[var(--pds-text)]">{{ calendarMonthLabel }}</span>
          <button
            type="button"
            class="rounded px-2 py-1 text-[var(--pds-primary)] hover:bg-[var(--pds-primary)]/10"
            @click="nextMonth"
          >
            ›
          </button>
        </div>
        <div class="calendar-grid grid grid-cols-7 gap-1 sm:gap-2">
          <div
            v-for="(d, di) in ['L', 'M', 'M', 'J', 'V', 'S', 'D']"
            :key="di"
            class="text-center text-xs font-medium text-[var(--pds-muted)]"
          >
            {{ d }}
          </div>
          <button
            v-for="(cell, idx) in calendarDays"
            :key="idx"
            type="button"
            class="calendar-day flex aspect-square items-center justify-center rounded-lg border text-sm transition-colors"
            :class="{
              'cursor-default border-transparent bg-transparent': cell.day == null,
              'cursor-not-allowed opacity-40': cell.disabled && cell.day != null,
              'border-[var(--pds-primary)] bg-[var(--pds-primary)] text-white': date === cell.dateStr,
              'border-[var(--pds-border)] bg-[var(--pds-bg)] hover:border-[var(--pds-primary)]': cell.day != null && !cell.disabled && date !== cell.dateStr,
              'border-[var(--pds-border)] bg-[var(--pds-bg)]': cell.day != null && !cell.disabled && date !== cell.dateStr,
            }"
            :disabled="cell.day == null || cell.disabled"
            @click="selectCalendarDate(cell.dateStr)"
          >
            {{ cell.day ?? '' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Heure de début -->
    <div v-if="date && durationHours" class="space-y-3">
      <h3 class="pds-subtitle">
        Heure de début
      </h3>
      <div v-if="loadingSlots" class="min-h-[80px] text-sm text-[var(--pds-muted)]">
        Chargement des créneaux...
      </div>
      <div v-else-if="availableStartHoursList.length === 0" class="min-h-[48px] text-sm text-amber-400">
        Aucun créneau disponible pour cette date avec la durée choisie. Les pros ont-ils bien enregistré leurs dispos pour ce jour ?
      </div>
      <div v-else class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          v-for="h in availableStartHoursList"
          :key="h"
          type="button"
          class="pds-option !py-3 min-h-[48px] touch-manipulation"
          :class="{ selected: startHour === h }"
          @click="startHour = h"
        >
          {{ h }}h00
        </button>
      </div>
    </div>

    <!-- Résumé -->
    <div v-if="canBook" class="pds-summary">
      <div class="pds-summary-line">
        <span>Date</span>
        <strong>{{ selectedDate?.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</strong>
      </div>
      <div class="pds-summary-line">
        <span>Horaire</span>
        <strong>{{ summaryTimeRange }}</strong>
      </div>
      <div class="pds-summary-line">
        <span>Durée</span>
        <strong>{{ durationHours }}h</strong>
      </div>
      <div class="pds-summary-line">
        <span>Prix total</span>
        <strong>{{ totalPrice }}€</strong>
      </div>
      <div class="pds-summary-line border-t border-[var(--pds-border)] pt-3">
        <span>Acompte (30%)</span>
        <strong>{{ depositAmount }}€</strong>
      </div>
    </div>

    <!-- Style + prod -->
    <div class="pds-card space-y-4">
      <div class="form-group">
        <label class="pds-label">Style musical</label>
        <select v-model="style" class="pds-input">
          <option value="Trap">Trap</option>
          <option value="Drill">Drill</option>
          <option value="Afro">Afro</option>
          <option value="RnB">RnB</option>
          <option value="Boom Bap">Boom Bap</option>
        </select>
      </div>
      <div class="form-group">
        <label class="pds-label">Uploader ma prod (optionnel)</label>
        <input
          type="file"
          accept="audio/*"
          class="w-full text-sm text-[var(--pds-text)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--pds-primary)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
          @change="handleBookerProdFileChange"
        >
        <p v-if="bookerProdFile" class="mt-1 text-sm text-[var(--pds-muted)]">
          {{ bookerProdFile?.name }}
        </p>
      </div>
      <div class="form-group">
        <label class="pds-label">Ou choisir une prod des beatmakers (optionnel)</label>
        <select v-model="selectedBeatId" class="pds-input" @change="handleBeatSelect">
          <option value="">
            Aucune
          </option>
          <option v-for="b in beats" :key="b.id" :value="b.id">
            {{ b.title }} — {{ b.style }}{{ b.price ? ` (${b.price}€)` : '' }}
          </option>
        </select>
      </div>
    </div>

    <p v-if="localError || sessionsError" class="text-sm text-red-400">
      {{ localError || sessionsError }}
    </p>
    <p v-if="success" class="text-sm text-emerald-400">
      {{ success }}
    </p>
    <button
      class="btn-primary w-full"
      :disabled="!canBook || sessionsLoading || uploadingProd"
      @click="handleBook"
    >
      {{ uploadingProd ? 'Envoi de la prod...' : 'Réserver ce créneau' }}
    </button>

    <!-- Liste des sessions -->
    <div class="space-y-4">
      <h3 class="pds-subtitle">
        Tes prochaines sessions
      </h3>
      <div v-if="sessionsLoading" class="text-sm text-[var(--pds-muted)]">
        Chargement...
      </div>
      <div v-else-if="Object.keys(groupedByDate).length === 0" class="text-sm text-[var(--pds-muted)]">
        Aucune session. Réserve un créneau ci-dessus.
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="(sessionsForDay, day) in groupedByDate"
          :key="day"
          class="pds-card"
        >
          <div class="mb-3 font-medium text-[var(--pds-text)]">
            {{ day }}
          </div>
          <div class="space-y-2">
            <div
              v-for="s in sessionsForDay"
              :key="s.id"
              class="rounded-lg border border-[var(--pds-border)] bg-[var(--pds-bg)] p-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span class="font-medium">{{ s.startTime }} – {{ s.endTime }}</span>
                  <span class="ml-2 rounded bg-[var(--pds-border)] px-2 py-0.5 text-xs">{{ s.style }}</span>
                  <span v-if="s.totalPrice" class="ml-2 text-sm text-[var(--pds-muted)]">{{ s.totalPrice }}€</span>
                </div>
                <span
                  class="rounded-full px-2 py-0.5 text-xs"
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
              <div v-if="s.status === 'pending'" class="mt-3 border-t border-[var(--pds-border)] pt-3">
                <p class="mb-2 text-xs text-[var(--pds-muted)]">
                  Payer l’acompte ({{ depositForSession(s) }}€) avec PayPal
                </p>
                <button
                  type="button"
                  class="btn-secondary !py-2 !px-3 !text-sm"
                  @click="initPaypalBooking(s.id, depositForSession(s))"
                >
                  Afficher PayPal
                </button>
                <div :id="`paypal-button-${s.id}`" class="mt-2" />
                <p v-if="paypalError" class="mt-1 text-xs text-red-400">
                  {{ paypalError }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
