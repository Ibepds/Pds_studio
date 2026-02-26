<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useSessions } from '../../composables/useSessions'
import { useSessionFiles } from '../../composables/useSessionFiles'

/** 'reserver' = formulaire uniquement, 'mes-sessions' = liste + PayPal uniquement, 'all' = tout (défaut) */
const props = withDefaults(defineProps<{ mode?: 'reserver' | 'mes-sessions' | 'all' }>(), { mode: 'all' })
const showReserver = computed(() => props.mode === 'reserver' || props.mode === 'all')
const showMesSessions = computed(() => props.mode === 'mes-sessions' || props.mode === 'all')
import { useBookerProdUpload } from '../../composables/useBookerProdUpload'
import { usePaypal } from '../../composables/usePaypal'
import { useAuth } from '../../composables/useAuth'
import { filterOutBookedSlots, slotOverlapsAny, useAvailability, type SessionBlock } from '../../composables/useAvailability'
import { useUsers } from '../../composables/useUsers'
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
const {
  files: sessionFiles,
  loading: filesLoading,
  error: filesError,
  listForSession,
} = useSessionFiles()
const { listByRole: listUsersByRole } = useUsers()
const { getSlotsForUsersOnDate } = useAvailability()
const { upload: uploadBookerProd } = useBookerProdUpload()
const { currentUser } = useAuth()

const durationHours = ref<number | null>(null)
const date = ref<string>('')
const startHour = ref<number | null>(null)
const reservationName = ref<string>('')
const contactEmail = ref<string>('')

const bookerProdFile = ref<File | null>(null)
const localError = ref<string | null>(null)
const success = ref<string | null>(null)
const uploadingProd = ref(false)

const calendarMonth = ref(new Date())
const availableStartHoursList = ref<number[]>([])
const loadingSlots = ref(false)

const paypalError = ref<string | null>(null)
const paypalRenderedFor = ref<string | null>(null)

// Fichiers livrés par l'ingé pour une session (consultables dans "Mes réservations")
const filesSessionId = ref<string | null>(null)
const filesLocalError = ref<string | null>(null)

async function toggleFilesForSession(sessionId: string) {
  filesLocalError.value = null
  if (filesSessionId.value === sessionId) {
    filesSessionId.value = null
    return
  }
  filesSessionId.value = sessionId
  try {
    await listForSession(sessionId)
  } catch (e: any) {
    filesLocalError.value = e?.message ?? 'Erreur lors du chargement des fichiers de la session.'
  }
}

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

const canBook = computed(() => {
  const hasCoreFields =
    reservationName.value.trim() &&
    date.value &&
    durationHours.value &&
    startHour.value != null &&
    totalPrice.value > 0

  const email = contactEmail.value.trim() || currentUser.value?.email

  return !!(hasCoreFields && email)
})

async function loadAvailableSlots() {
  const d = date.value
  const dur = durationHours.value
  if (!d || dur == null) {
    availableStartHoursList.value = []
    return
  }
  loadingSlots.value = true
  try {
    const inges = await listUsersByRole('inge')
    const ingeIds = inges.map((i) => i.uid)
    const unavailMap = ingeIds.length > 0 ? await getSlotsForUsersOnDate(ingeIds, d) : new Map<string, { start: string; end: string }[]>()
    const hours = getAvailableStartHours(dur)
    const booked = await listSessionsForDate(d)
    const blocks: SessionBlock[] = booked.map((s) => ({
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
    }))
    let available = filterOutBookedSlots(hours, d, dur, blocks)
    if (ingeIds.length > 0) {
      available = available.filter((h) => {
        const slot = { start: formatHour(h), end: formatHour(h + dur) }
        return ingeIds.some((uid) => !slotOverlapsAny(slot, unavailMap.get(uid) ?? []))
      })
    }
    availableStartHoursList.value = available
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
}

watch(
  () => currentUser.value?.email,
  (email) => {
    if (email) {
      contactEmail.value = email
    }
  },
  { immediate: true },
)

const handleBook = async () => {
  localError.value = null
  success.value = null
  if (!canBook.value) {
    localError.value = 'Renseigne ton email, la durée, la date et l’heure.'
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
    const startTime = formatHour(startHour.value!)
    const endTime = formatHour(startHour.value! + durationHours.value!)
    const email = (contactEmail.value.trim() || currentUser.value?.email || '').trim()

    await bookSession({
      date: date.value,
      startTime,
      endTime,
      style: '',
      reservationName: reservationName.value.trim(),
      bookerProdUrl,
      bookerProdFileName,
      durationHours: durationHours.value!,
      totalPrice: totalPrice.value,
      depositAmount: depositAmount.value,
      contactEmail: email || undefined,
    })
    try {
      const inges = await listUsersByRole('inge')
      const ingeIds = inges.map((i) => i.uid)
      const unavailMap = ingeIds.length > 0 ? await getSlotsForUsersOnDate(ingeIds, date.value) : new Map()
      const sessionSlot = { start: startTime, end: endTime }
      const concerned = inges.filter((i) => !slotOverlapsAny(sessionSlot, unavailMap.get(i.uid) ?? []))
      const recipientEmails = concerned.map((i) => i.email).filter(Boolean) as string[]
      const recipientPhones = concerned.map((i) => i.phone).filter(Boolean) as string[]
      await $fetch('/api/notify-booking', {
        method: 'POST',
        body: {
          session: {
            date: date.value,
            startTime,
            endTime,
            bookerEmail: email || null,
            style: '',
            durationHours: durationHours.value,
            totalPrice: totalPrice.value,
          },
          recipientEmails,
          recipientPhones,
        },
      })
    } catch (e) {
      console.error('Notify booking', e)
    }

    if (email) {
      try {
        await $fetch('/api/send-booking-confirmation', {
          method: 'POST',
          body: {
            session: {
              bookerEmail: email,
              date: date.value,
              startTime,
              endTime,
              durationHours: durationHours.value,
            },
          },
        })
      } catch (e) {
        console.error('Send booking confirmation', e)
      }
    }
    success.value = 'Session réservée. Payer l’acompte ci‑dessous.'
    reservationName.value = ''
    durationHours.value = null
    date.value = ''
    startHour.value = null
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
        success.value = 'Paiement PayPal effectué, en attente de confirmation ingé.'
        try {
          await updateSessionStatus(sessionId, 'pending', orderId)
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

/** Reste à payer : valeur stockée ou calculée (total - acompte). */
function restToPayForSession(s: any): number {
  if (s.remainingToPay !== undefined && s.remainingToPay !== null) return s.remainingToPay
  return Math.max(0, (s.totalPrice ?? 0) - (s.depositAmount ?? 0))
}
</script>

<template>
  <div class="space-y-8">
    <template v-if="showReserver">
    <h2 class="pds-h2">
      Réserver une session
    </h2>

    <!-- Nom de la réservation -->
    <div>
      <h3 class="pds-subtitle mb-2">
        Nom de la réservation
      </h3>
      <input
        v-model="reservationName"
        type="text"
        class="pds-input w-full max-w-md"
        placeholder="Exemple : Session EP, Mix single, etc."
      >
    </div>

    <!-- Email de contact -->
    <div class="mt-4">
      <h3 class="pds-subtitle mb-2">
        Ton email
      </h3>
      <input
        v-model="contactEmail"
        type="email"
        class="pds-input w-full max-w-md"
        :disabled="!!currentUser?.email"
        placeholder="ton.email@example.com"
      >
      <p class="mt-1 text-xs text-[var(--pds-muted)]">
        Nous utiliserons cet email pour t’envoyer la confirmation, le récap et les pistes livrées par l’ingé.
      </p>
    </div>

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
        <span>Nom</span>
        <strong>{{ reservationName }}</strong>
      </div>
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

    <!-- Upload prod (optionnel) -->
    <div class="pds-card space-y-4">
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
    </template>

    <!-- Liste des sessions -->
    <div v-if="showMesSessions" class="space-y-4">
      <h2 class="pds-h2">
        Mes réservations
      </h2>
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
              class="rounded-lg border border-[var(--pds-border)] bg-[var(--pds-bg)] p-3 space-y-2"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span class="font-medium">{{ s.startTime }} – {{ s.endTime }}</span>
                  <span v-if="s.style" class="ml-2 rounded bg-[var(--pds-border)] px-2 py-0.5 text-xs">{{ s.style }}</span>
                  <span v-if="s.reservationName" class="ml-2 text-xs text-[var(--pds-muted)]">« {{ s.reservationName }} »</span>
                  <span v-if="s.totalPrice" class="ml-2 text-sm text-[var(--pds-muted)]">{{ s.totalPrice }}€</span>
                </div>
                <span
                  class="rounded-full px-2 py-0.5 text-xs"
                  :class="{
                    'bg-red-500/20 text-red-300': s.status === 'waiting_payment',
                    'bg-amber-500/20 text-amber-300': s.status === 'pending',
                    'bg-emerald-500/20 text-emerald-300': s.status === 'confirmed',
                    'bg-slate-500/20 text-slate-300': s.status === 'done',
                    'bg-red-800/20 text-red-200': s.status === 'cancelled',
                  }"
                >
                  <template v-if="s.status === 'waiting_payment'">
                    Attente paiement
                  </template>
                  <template v-else-if="s.status === 'pending'">
                    En attente ingé
                  </template>
                  <template v-else-if="s.status === 'confirmed'">
                    Confirmée
                  </template>
                  <template v-else-if="s.status === 'done'">
                    Terminée
                  </template>
                  <template v-else-if="s.status === 'cancelled'">
                    Annulée
                  </template>
                  <template v-else>
                    {{ s.status }}
                  </template>
                </span>
              </div>
              <!-- Récap envoyé + reste à payer (sessions confirmées / terminées) -->
              <div
                v-if="s.status === 'confirmed' || s.status === 'done'"
                class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--pds-muted)]"
              >
                <span v-if="s.recapSentAt" class="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">
                  Un récap a été envoyé par mail
                </span>
                <span>
                  Reste à payer : <strong class="text-[var(--pds-text)]">{{ restToPayForSession(s) }}€</strong>
                </span>
              </div>
              <!-- Bloc paiement -->
              <div v-if="s.status === 'waiting_payment'" class="mt-3 border-t border-[var(--pds-border)] pt-3">
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
              <!-- Bloc fichiers / prods de la session pour le booker -->
              <div
                v-if="s.status === 'confirmed' || s.status === 'done'"
                class="mt-2 border-t border-[var(--pds-border)] pt-2 space-y-2"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-xs text-[var(--pds-muted)]">
                    Fichiers de la session (prod + exports ingé)
                  </p>
                  <button
                    type="button"
                    class="btn-secondary !py-1.5 !px-3 !text-xs"
                    @click="toggleFilesForSession(s.id)"
                  >
                    {{ filesSessionId === s.id ? 'Masquer les fichiers' : 'Voir les fichiers' }}
                  </button>
                </div>
                <div v-if="filesSessionId === s.id" class="space-y-1">
                  <!-- Prod fournie à la réservation -->
                  <div v-if="s.bookerProdUrl || s.beatTitle" class="rounded border border-[var(--pds-border)] bg-[var(--pds-bg)] px-3 py-2">
                    <p class="text-xs font-medium text-[var(--pds-text)]">
                      Prod de la session
                    </p>
                    <p v-if="s.beatTitle" class="text-xs text-[var(--pds-muted)]">
                      Beat sélectionné : {{ s.beatTitle }}
                    </p>
                    <p v-if="s.bookerProdFileName" class="text-xs text-[var(--pds-muted)]">
                      Fichier uploadé : {{ s.bookerProdFileName }}
                    </p>
                    <a
                      v-if="s.bookerProdUrl"
                      :href="s.bookerProdUrl"
                      target="_blank"
                      rel="noreferrer"
                      class="mt-1 inline-flex text-xs text-[var(--pds-primary)] hover:underline"
                    >
                      Télécharger / écouter la prod
                    </a>
                  </div>

                  <!-- Fichiers rendus par l'ingé -->
                  <div class="rounded border border-[var(--pds-border)] bg-[var(--pds-bg)] px-3 py-2">
                    <p class="text-xs font-medium text-[var(--pds-text)]">
                      Fichiers rendus par l’ingé
                    </p>
                    <p v-if="filesLocalError || filesError" class="mt-1 text-xs text-red-400">
                      {{ filesLocalError || filesError }}
                    </p>
                    <p v-else-if="filesLoading" class="mt-1 text-xs text-[var(--pds-muted)]">
                      Chargement des fichiers...
                    </p>
                    <p v-else-if="sessionFiles.length === 0" class="mt-1 text-xs text-[var(--pds-muted)]">
                      Aucun fichier disponible pour l’instant.
                    </p>
                    <ul v-else class="mt-1 space-y-1 text-xs">
                      <li
                        v-for="f in sessionFiles"
                        :key="f.id"
                        class="flex items-center justify-between gap-2 rounded bg-[var(--pds-card)] px-2 py-1"
                      >
                        <div class="min-w-0">
                          <p class="truncate text-[var(--pds-text)]">
                            {{ f.fileName }}
                          </p>
                          <a
                            :href="f.url"
                            target="_blank"
                            rel="noreferrer"
                            class="text-[10px] text-[var(--pds-primary)] hover:underline"
                          >
                            Télécharger / ouvrir
                          </a>
                        </div>
                        <span class="shrink-0 text-[10px] text-[var(--pds-muted)]">
                          {{ f.createdAt.toLocaleDateString() }}
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
