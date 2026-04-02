<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { navigateTo } from '#app'
import { useSessions } from '../../composables/useSessions'
import { useSessionFiles } from '../../composables/useSessionFiles'
import { useBookerProdUpload } from '../../composables/useBookerProdUpload'
import { usePaypal } from '../../composables/usePaypal'
import { useAuth } from '../../composables/useAuth'
import {
  filterOutBookedSlots,
  slotOverlapsAny,
  useAvailability,
  type SessionBlock,
} from '../../composables/useAvailability'
import { useUsers } from '../../composables/useUsers'
import { getAvailableStartHours } from '../../utils/pricing'
import { DURATION_OPTIONS, getDeposit, getTotalPrice } from '../../utils/pricing'

/** 'reserver' = formulaire uniquement, 'mes-sessions' = liste + PayPal uniquement, 'all' = tout (défaut) */
const props = withDefaults(
  defineProps<{
    mode?: 'reserver' | 'mes-sessions' | 'all'
    /** Fourni par la page après l’étape « Beatmaker / Ingé » (hors composant) */
    bookingKind?: 'beatmaker' | 'inge' | null
  }>(),
  {
    mode: 'all',
    bookingKind: null,
  },
)

const emit = defineEmits<{ booked: []; backKind: [] }>()
const showReserver = computed(() => props.mode === 'reserver' || props.mode === 'all')
const showMesSessions = computed(() => props.mode === 'mes-sessions' || props.mode === 'all')

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
const artistFirstName = ref<string>('')
const artistLastName = ref<string>('')
const contactPhone = ref<string>('')
const contactEmail = ref<string>('')
const bookerNotes = ref<string>('')

const artistFullName = computed(() =>
  `${artistFirstName.value.trim()} ${artistLastName.value.trim()}`.trim(),
)

const bookerProdFile = ref<File | null>(null)
const localError = ref<string | null>(null)
const success = ref<string | null>(null)
const uploadingProd = ref(false)

function mondayOfWeekContaining(d: Date): Date {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

const slotWeekStart = ref<Date>(mondayOfWeekContaining(new Date()))
const weekAvailabilityMap = ref<Record<string, number[]>>({})
const occupiedHoursByDate = ref<Record<string, number[]>>({})
const availableStartHoursList = ref<number[]>([])
const loadingSlots = ref(false)

const paypalError = ref<string | null>(null)
const paypalRenderedFor = ref<string | null>(null)

/** Overlay pendant le lancement PayPal (étape "Confirmer et payer"). */
const paymentModalOpen = ref(false)
const paymentModalSessionId = ref<string | null>(null)

type PaymentResult = 'success' | 'error'
const paymentResult = ref<PaymentResult | null>(null)
let paymentResultTimer: number | null = null

function clearPaymentResultTimer() {
  if (paymentResultTimer != null) {
    clearTimeout(paymentResultTimer)
    paymentResultTimer = null
  }
}

function showPaymentResult(result: PaymentResult) {
  paymentResult.value = result
  clearPaymentResultTimer()

  // On laisse l'écran afficher 6 secondes avant de revenir à l'accueil.
  paymentResultTimer = window.setTimeout(() => {
    paymentResult.value = null
    navigateTo('/')
  }, 6000)
}

function goHomeNow() {
  clearPaymentResultTimer()
  paymentResult.value = null
  navigateTo('/')
}

onBeforeUnmount(() => {
  clearPaymentResultTimer()
})

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

const weekHasNoSlots = computed(() => {
  const m = weekAvailabilityMap.value
  const keys = Object.keys(m)
  if (keys.length === 0) return false
  return keys.every((k) => (m[k]?.length ?? 0) === 0)
})

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

/** Libellés maquette récap (ex. « Samedi 14 mars », « 13h00 - 17h00 ») */
const recapDateLabel = computed(() => {
  if (!selectedDate.value) return ''
  return selectedDate.value.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
})

const recapTimeRangeLabel = computed(() => {
  if (startHour.value == null || !durationHours.value) return ''
  const end = startHour.value + durationHours.value
  return `${String(startHour.value).padStart(2, '0')}h00 - ${String(end).padStart(2, '0')}h00`
})

const recapSessionLine = computed(() => {
  if (props.bookingKind === 'beatmaker') return 'Session Beatmaker'
  if (props.bookingKind === 'inge') return 'Session Ingénieur du son'
  return 'Session'
})

const recapEmailDisplay = computed(
  () => contactEmail.value.trim() || currentUser.value?.email || '—',
)

const canBook = computed(() => {
  const hasCoreFields =
    artistFirstName.value.trim() &&
    artistLastName.value.trim() &&
    contactPhone.value.trim() &&
    date.value &&
    durationHours.value &&
    startHour.value != null &&
    totalPrice.value > 0

  const email = contactEmail.value.trim() || currentUser.value?.email

  if (useBookingWizard.value && props.bookingKind == null) return false
  return !!(hasCoreFields && email)
})

/** Parcours en 3 étapes (après choix du type sur la page) : créneau → infos → validation */
const bookingStep = ref<1 | 2 | 3>(1)
const useBookingWizard = computed(() => props.mode === 'reserver' || props.mode === 'all')

const sessionStyleLabel = computed(() => {
  if (props.bookingKind === 'beatmaker') return 'Beatmaker'
  if (props.bookingKind === 'inge') return 'Ingénieur du son'
  return ''
})

const canProceedSlotStep = computed(() => {
  if (durationHours.value == null || !date.value || startHour.value == null) return false
  if (loadingSlots.value) return false
  if (availableStartHoursList.value.length === 0) return false
  return totalPrice.value > 0
})

const canProceedContactStep = computed(() => {
  const email = contactEmail.value.trim() || currentUser.value?.email
  return !!(
    artistFirstName.value.trim() &&
    artistLastName.value.trim() &&
    contactPhone.value.trim() &&
    email
  )
})

function nextBookingStep() {
  if (bookingStep.value === 1 && canProceedSlotStep.value) bookingStep.value = 2
  else if (bookingStep.value === 2 && canProceedContactStep.value) bookingStep.value = 3
}

function prevBookingStep() {
  if (bookingStep.value > 1) bookingStep.value = (bookingStep.value - 1) as 1 | 2 | 3
}

function minutesFromTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function hourBlockOverlapsSession(h: number, startTime: string, endTime: string): boolean {
  const block0 = h * 60
  const block1 = (h + 1) * 60
  const s0 = minutesFromTime(startTime)
  const s1 = minutesFromTime(endTime)
  return block0 < s1 && block1 > s0
}

function getWeekDateStrings(monday: Date): string[] {
  const base = new Date(monday)
  base.setHours(12, 0, 0, 0)
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const x = new Date(base)
    x.setDate(base.getDate() + i)
    out.push(
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`,
    )
  }
  return out
}

type BookedSessionRow = { date: string; startTime: string; endTime: string }

async function computeAvailableStartsForDate(
  d: string,
  preloadedBooked?: BookedSessionRow[],
): Promise<number[]> {
  const dur = durationHours.value
  const kind = props.bookingKind
  if (!d || dur == null || !kind) return []
  const role = kind === 'beatmaker' ? 'beatmaker' : 'inge'
  const pros = await listUsersByRole(role)
  const proIds = pros.map((p) => p.uid)
  const unavailMap =
    proIds.length > 0
      ? await getSlotsForUsersOnDate(proIds, d)
      : new Map<string, { start: string; end: string }[]>()
  const hours = getAvailableStartHours(dur)
  const booked = preloadedBooked ?? (await listSessionsForDate(d))
  const blocks: SessionBlock[] = booked.map((s) => ({
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
  }))
  let available = filterOutBookedSlots(hours, d, dur, blocks)
  if (proIds.length > 0) {
    available = available.filter((h) => {
      const slot = { start: formatHour(h), end: formatHour(h + dur) }
      return proIds.some((uid) => !slotOverlapsAny(slot, unavailMap.get(uid) ?? []))
    })
  }
  return available
}

function syncAvailabilityForSelectedDate() {
  const d = date.value
  if (!d) {
    availableStartHoursList.value = []
    return
  }
  const list = weekAvailabilityMap.value[d]
  if (list) {
    availableStartHoursList.value = list
    if (startHour.value != null && !list.includes(startHour.value)) {
      startHour.value = null
    }
  } else {
    availableStartHoursList.value = []
    if (Object.keys(weekAvailabilityMap.value).length > 0) {
      startHour.value = null
    }
  }
}

async function loadWeekData() {
  const dur = durationHours.value
  const kind = props.bookingKind
  if (dur == null || !kind) {
    weekAvailabilityMap.value = {}
    occupiedHoursByDate.value = {}
    availableStartHoursList.value = []
    return
  }
  loadingSlots.value = true
  try {
    const dates = getWeekDateStrings(slotWeekStart.value)
    const availEntries: [string, number[]][] = []
    const occEntries: [string, number[]][] = []
    for (const ds of dates) {
      const booked = await listSessionsForDate(ds)
      const available = await computeAvailableStartsForDate(ds, booked)
      availEntries.push([ds, available])
      const occ = new Set<number>()
      for (const s of booked) {
        for (let h = 0; h <= 23; h++) {
          if (hourBlockOverlapsSession(h, s.startTime, s.endTime)) occ.add(h)
        }
      }
      occEntries.push([ds, [...occ]])
    }
    weekAvailabilityMap.value = Object.fromEntries(availEntries)
    occupiedHoursByDate.value = Object.fromEntries(occEntries)
    syncAvailabilityForSelectedDate()
  } catch {
    weekAvailabilityMap.value = {}
    occupiedHoursByDate.value = {}
    availableStartHoursList.value = []
  } finally {
    loadingSlots.value = false
  }
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function prevSlotWeek() {
  if (durationHours.value == null) return
  slotWeekStart.value = addDays(slotWeekStart.value, -7)
}

function nextSlotWeek() {
  if (durationHours.value == null) return
  slotWeekStart.value = addDays(slotWeekStart.value, 7)
}

function onSlotPick(payload: { dateStr: string; hour: number }) {
  date.value = payload.dateStr
  startHour.value = payload.hour
  syncAvailabilityForSelectedDate()
}

function emitBackKind() {
  emit('backKind')
}

watch(
  [slotWeekStart, durationHours, () => props.bookingKind],
  () => {
    const dates = getWeekDateStrings(slotWeekStart.value)
    if (date.value && !dates.includes(date.value)) {
      date.value = ''
      startHour.value = null
    }
    loadWeekData()
  },
  { immediate: true },
)

watch(date, () => {
  syncAvailabilityForSelectedDate()
})

const slotSummaryLine = computed(() => {
  if (!date.value || startHour.value == null || !durationHours.value) return ''
  const d = new Date(date.value + 'T12:00:00')
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
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
  const end = startHour.value + durationHours.value
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} - ${String(startHour.value).padStart(2, '0')}:00 ${String(end).padStart(2, '0')}:00`
})

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
  if (useBookingWizard.value && bookingStep.value !== 3) return
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

    const createdSessionId = await bookSession({
      date: date.value,
      startTime,
      endTime,
      style: sessionStyleLabel.value,
      reservationName: artistFullName.value,
      bookerPhone: contactPhone.value.trim(),
      bookerNotes: bookerNotes.value.trim() || undefined,
      bookerProdUrl,
      bookerProdFileName,
      durationHours: durationHours.value!,
      totalPrice: totalPrice.value,
      depositAmount: depositAmount.value,
      contactEmail: email || undefined,
    })

    // Afficher l’écran "PAIEMENT EN COURS..." pendant le lancement de la pop-up PayPal
    paymentModalOpen.value = true
    paymentModalSessionId.value = createdSessionId
    await nextTick()
    await initPaypalBooking(createdSessionId, depositAmount.value)

    try {
      const notifyRole = props.bookingKind === 'beatmaker' ? 'beatmaker' : 'inge'
      const pros = await listUsersByRole(notifyRole)
      const proIds = pros.map((p) => p.uid)
      const unavailMap =
        proIds.length > 0 ? await getSlotsForUsersOnDate(proIds, date.value) : new Map()
      const sessionSlot = { start: startTime, end: endTime }
      const concerned = pros.filter(
        (p) => !slotOverlapsAny(sessionSlot, unavailMap.get(p.uid) ?? []),
      )
      const recipientEmails = concerned.map((p) => p.email).filter(Boolean) as string[]
      const recipientPhones = concerned.map((p) => p.phone).filter(Boolean) as string[]
      await $fetch('/api/notify-booking', {
        method: 'POST',
        body: {
          session: {
            date: date.value,
            startTime,
            endTime,
            bookerEmail: email || null,
            style: sessionStyleLabel.value,
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
        await new Promise((r) => setTimeout(r, 1100))
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
        console.log('Booking confirmation sent', email)
      } catch (e) {
        console.error('Send booking confirmation', e)
      }
    }
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
    paypal
      .Buttons({
        // Forcer l’interface PayPal (pas “Debit or Credit Card”).
        // Format simple pour compatibilité SDK.
        fundingSource: paypal?.FUNDING?.PAYPAL ?? undefined,
        disableFunding: 'card',
        createOrder: (_data: any, actions: any) =>
          actions.order.create({
            purchase_units: [
              {
                amount: { value: valueApi, currency_code: 'EUR' },
                description: 'Acompte 30% — réservation session studio PDS',
              },
            ],
          }),
        onApprove: async (data: any, actions: any) => {
          await actions.order.capture()
          const orderId = data?.orderID
          success.value = 'Paiement PayPal effectué, en attente de confirmation ingé.'
          paymentModalOpen.value = false
          paymentModalSessionId.value = null
          try {
            await updateSessionStatus(sessionId, 'pending', orderId)
          } catch (e) {
            console.error(e)
          }

          // Rafraîchir l'état (utile pour l'écran "Mes réservations")
          await listForCurrentBooker()

          showPaymentResult('success')
        },
        onError: () => {
          paypalError.value = 'Erreur lors du paiement PayPal.'
          paymentModalOpen.value = false
          paymentModalSessionId.value = null
          showPaymentResult('error')
        },
      })
      .render(`#paypal-button-${sessionId}`)
    paypalRenderedFor.value = sessionId
  } catch (e: any) {
    paypalError.value = e?.message ?? 'Impossible de charger PayPal.'
  }
}

const depositForSession = (s: any) => s.depositAmount ?? Math.round((s.totalPrice ?? 50) * 0.3)

const noSlotsHint = computed(() =>
  props.bookingKind === 'beatmaker'
    ? 'Aucun créneau disponible pour cette date avec la durée choisie. Les beatmakers ont-ils bien enregistré leurs dispos pour ce jour ?'
    : 'Aucun créneau disponible pour cette date avec la durée choisie. Les ingés ont-ils bien enregistré leurs dispos pour ce jour ?',
)

/** Reste à payer : valeur stockée ou calculée (total - acompte). */
function restToPayForSession(s: any): number {
  if (s.remainingToPay !== undefined && s.remainingToPay !== null) return s.remainingToPay
  return Math.max(0, (s.totalPrice ?? 0) - (s.depositAmount ?? 0))
}
</script>

<template>
  <div class="space-y-8">
    <!-- Écrans succès / échec (6 secondes) -->
    <div
      v-if="paymentResult"
      class="fixed left-0 right-0 bottom-0 top-[3.25rem] sm:top-[4.25rem] z-[95] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div class="absolute inset-0 pointer-events-none z-0">
        <FigmaLandingBackground variant="slot" />
      </div>

      <div class="relative z-10 flex w-full flex-col items-center gap-6 px-6 text-center">
        <div
          v-if="paymentResult === 'success'"
          class="mt-2 inline-flex h-[60px] w-[60px] items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div
          v-else
          class="mt-2 inline-flex h-[60px] w-[60px] items-center justify-center rounded-full border border-red-400/50 bg-red-400/10 text-red-300"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>

        <h2
          class="font-[Raleway,sans-serif] text-[42px] font-extrabold uppercase tracking-wide text-white sm:text-[50px]"
        >
          {{ paymentResult === 'success' ? 'PAIEMENT RÉALISÉ AVEC SUCCÈS' : 'ÉCHEC DU PAIEMENT' }}
        </h2>

        <p v-if="paymentResult === 'success'" class="max-w-[740px] text-sm text-white/80 sm:text-base">
          Votre réservation est confirmée !<br />
          Vous allez recevoir un email de confirmation avec tous les détails de votre séance (date, heure, studio
          et informations requises).
        </p>

        <button
          type="button"
          class="mt-2 rounded-full border border-white/50 bg-transparent px-8 py-3 font-[Raleway,sans-serif] text-lg font-medium text-white transition hover:bg-white/10"
          @click="goHomeNow"
        >
          Retour à l'accueil
        </button>
      </div>
    </div>

    <template v-if="showReserver && useBookingWizard && bookingKind">
      <!-- Étape 1 : durée + date + heure -->
      <div v-show="bookingStep === 1" class="space-y-8">
      <!-- Durée (2h à 12h) -->
      <div>
        <h3 class="pds-subtitle mb-4">Combien d’heures souhaitez-vous réserver ? (2h minimum)</h3>
        <select v-model="durationHours" class="pds-input w-full max-w-xs">
          <option :value="null">Choisir</option>
          <option v-for="h in DURATION_OPTIONS" :key="h" :value="h">
            {{ h }} heure{{ h > 1 ? 's' : '' }}
          </option>
        </select>
        <p v-if="!durationHours" class="mt-2 text-sm text-[var(--pds-muted2)]">
          La grille ci-dessous s’active dès que tu as choisi une durée.
        </p>
      </div>

      <!-- Grille semaine × 24 h : visible tout de suite, inactive sans durée -->
      <div v-if="bookingKind" class="relative -mx-4 overflow-hidden rounded-2xl sm:-mx-6">
        <div class="pointer-events-none absolute inset-0 min-h-[560px]">
          <FigmaLandingBackground variant="slot" />
        </div>
        <div class="relative z-10 space-y-4 px-4 py-8 sm:px-6 sm:py-10">
          <BookingSlotGrid
            :week-start-monday="slotWeekStart"
            :duration-hours="durationHours"
            :model-date="date"
            :model-start-hour="startHour"
            :loading="loadingSlots"
            :available-starts-by-date="weekAvailabilityMap"
            :occupied-hours-by-date="occupiedHoursByDate"
            @pick="onSlotPick"
            @prev-week="prevSlotWeek"
            @next-week="nextSlotWeek"
          />
          <p
            v-if="
              durationHours &&
              !loadingSlots &&
              (weekHasNoSlots || (date && availableStartHoursList.length === 0))
            "
            class="text-sm text-amber-400"
          >
            {{ noSlotsHint }}
          </p>
        </div>
      </div>

        <div
          class="mt-8 flex flex-col gap-6 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
        >
          <p
            class="min-h-[1.25rem] font-[Raleway,sans-serif] text-lg font-bold leading-tight text-white md:text-2xl"
          >
            {{ slotSummaryLine }}
          </p>
          <div class="flex flex-wrap items-center justify-end gap-3 sm:gap-4">
            <button
              type="button"
              class="rounded-full border border-white/50 bg-transparent px-8 py-3 font-[Raleway,sans-serif] text-lg font-medium text-white transition hover:bg-white/10"
              @click="emitBackKind"
            >
              Retour
            </button>
            <button
              type="button"
              class="rounded-full bg-gradient-to-r from-[#0073FF] to-[#64E8FF] px-8 py-3 font-[Raleway,sans-serif] text-lg font-medium text-black transition enabled:hover:opacity-95 disabled:opacity-50"
              :disabled="!canProceedSlotStep"
              @click="nextBookingStep"
            >
              Continuer
            </button>
          </div>
        </div>
      </div>

      <!-- Étape 2 : information artiste (maquette) -->
      <div v-show="bookingStep === 2" class="relative -mx-4 overflow-hidden rounded-2xl sm:-mx-6">
        <div class="pointer-events-none absolute inset-0 min-h-[520px]">
          <FigmaLandingBackground variant="slot" />
        </div>
        <div class="relative z-10 px-4 py-10 sm:px-6 sm:py-14">
          <div class="mx-auto w-full max-w-[615px] space-y-10">
            <h2
              class="font-[Raleway,sans-serif] text-3xl font-extrabold uppercase leading-none tracking-tight text-white sm:text-4xl md:text-[50px] md:leading-[0.76]"
            >
              Information artiste
            </h2>
            <div class="flex flex-col gap-5">
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-[15px]">
                <input
                  v-model="artistFirstName"
                  type="text"
                  autocomplete="given-name"
                  placeholder="Prénom"
                  class="h-[49px] w-full min-w-0 rounded-full border border-white/50 bg-[#0f0f0f] px-5 font-[Raleway,sans-serif] text-lg font-medium text-white outline-none placeholder:text-white/25 focus:border-white/70"
                />
                <input
                  v-model="artistLastName"
                  type="text"
                  autocomplete="family-name"
                  placeholder="Nom"
                  class="h-[49px] w-full min-w-0 rounded-full border border-white/50 bg-[#0f0f0f] px-5 font-[Raleway,sans-serif] text-lg font-medium text-white outline-none placeholder:text-white/25 focus:border-white/70"
                />
              </div>
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-[15px]">
                <input
                  v-model="contactPhone"
                  type="tel"
                  autocomplete="tel"
                  placeholder="Téléphone"
                  class="h-[49px] w-full min-w-0 rounded-full border border-white/50 bg-[#0f0f0f] px-5 font-[Raleway,sans-serif] text-lg font-medium text-white outline-none placeholder:text-white/25 focus:border-white/70"
                />
                <input
                  v-model="contactEmail"
                  type="email"
                  autocomplete="email"
                  :disabled="!!currentUser?.email"
                  placeholder="Email"
                  class="h-[49px] w-full min-w-0 rounded-full border border-white/50 bg-[#0f0f0f] px-5 font-[Raleway,sans-serif] text-lg font-medium text-white outline-none placeholder:text-white/25 focus:border-white/70 disabled:opacity-60"
                />
              </div>
              <textarea
                v-model="bookerNotes"
                rows="5"
                placeholder="Informations complémentaires"
                class="min-h-[132px] w-full resize-y rounded-[15px] border border-white/50 bg-[#0f0f0f] px-5 py-3 font-[Raleway,sans-serif] text-lg font-medium text-white outline-none placeholder:text-white/25 focus:border-white/70"
              />
              <div class="rounded-[15px] border border-dashed border-white/20 bg-black/20 px-4 py-3">
                <span class="block text-xs font-medium text-white/60">Fichier audio (optionnel)</span>
                <input
                  type="file"
                  accept="audio/*"
                  class="mt-2 w-full text-sm text-white/80 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                  @change="handleBookerProdFileChange"
                />
                <p v-if="bookerProdFile" class="mt-2 text-sm text-white/50">
                  {{ bookerProdFile?.name }}
                </p>
              </div>
            </div>
            <div class="flex flex-wrap gap-[15px]">
              <button
                type="button"
                class="rounded-full border border-white/50 bg-transparent px-8 py-3 font-[Raleway,sans-serif] text-lg font-medium text-white transition hover:bg-white/10"
                @click="prevBookingStep"
              >
                Retour
              </button>
              <button
                type="button"
                class="rounded-full border border-white/50 bg-transparent px-8 py-3 font-[Raleway,sans-serif] text-lg font-medium text-white transition hover:bg-white/10 disabled:opacity-40"
                :disabled="!canProceedContactStep"
                @click="nextBookingStep"
              >
                Continuer
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Étape 3 : récapitulatif (maquette) -->
      <div v-show="bookingStep === 3" class="relative -mx-4 overflow-hidden rounded-2xl sm:-mx-6">
        <div class="pointer-events-none absolute inset-0 min-h-[560px]">
          <FigmaLandingBackground variant="slot" />
        </div>
        <!-- Overlay pendant que PayPal est lancé -->
        <div
          v-if="paymentModalOpen && paymentModalSessionId"
          class="fixed left-0 right-0 bottom-0 top-[3.25rem] sm:top-[4.25rem] z-[80] flex items-center justify-center"
        >
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div class="absolute inset-0 pointer-events-none z-0">
            <FigmaLandingBackground variant="slot" />
            <h2
              class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-[Raleway,sans-serif] text-[42px] font-extrabold uppercase tracking-wide text-white sm:text-[50px]"
            >
              PAIEMENT EN COURS...
            </h2>
          </div>
          <div class="relative z-10 w-full px-4">
            <div class="mx-auto w-fit pointer-events-auto">
              <div :id="`paypal-button-${paymentModalSessionId}`" />
            </div>
          </div>
        </div>

        <div class="relative z-10 px-4 py-10 sm:px-6 sm:py-14">
          <div
            v-if="canProceedSlotStep && canProceedContactStep"
            class="mx-auto flex max-w-[1205px] flex-col gap-12 lg:gap-[50px]"
          >
              <h2
                class="font-[Raleway,sans-serif] text-3xl font-extrabold uppercase leading-none tracking-tight text-white sm:text-4xl md:text-[50px] md:leading-[0.76]"
              >
                Récapitulatif
              </h2>

              <div
                class="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-center lg:gap-16 xl:gap-[120px]"
              >
                <!-- Colonne gauche : information artiste -->
                <div class="flex w-full max-w-[400px] flex-col gap-8 lg:max-w-[320px]">
                  <h3
                    class="font-[Raleway,sans-serif] text-2xl font-bold leading-tight text-white md:text-[30px] md:leading-5"
                  >
                    Information Artiste
                  </h3>
                  <dl class="flex flex-col gap-5 font-[Raleway,sans-serif] text-lg font-medium text-white">
                    <div class="flex flex-col gap-1">
                      <dt>Prénom</dt>
                      <dd class="text-white/90">{{ artistFirstName }}</dd>
                    </div>
                    <div class="flex flex-col gap-1">
                      <dt>Nom</dt>
                      <dd class="text-white/90">{{ artistLastName }}</dd>
                    </div>
                    <div class="flex flex-col gap-1">
                      <dt>Email</dt>
                      <dd class="break-all text-white/90">{{ recapEmailDisplay }}</dd>
                    </div>
                    <div class="flex flex-col gap-1">
                      <dt>Téléphone</dt>
                      <dd class="text-white/90">{{ contactPhone }}</dd>
                    </div>
                    <div v-if="bookerNotes.trim()" class="flex flex-col gap-1">
                      <dt>Informations complémentaires</dt>
                      <dd class="whitespace-pre-wrap text-white/90">{{ bookerNotes }}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    class="w-fit rounded-full border border-white/50 bg-transparent px-8 py-3 font-[Raleway,sans-serif] text-lg font-medium text-white transition hover:border-transparent hover:bg-gradient-to-r hover:from-[#0073FF] hover:to-[#64E8FF] hover:text-black"
                    @click="prevBookingStep"
                  >
                    Retour
                  </button>
                </div>

                <div class="h-px w-full bg-white/30 lg:hidden" aria-hidden="true" />

                <!-- Séparateur vertical (desktop) -->
                <div
                  class="hidden h-auto min-h-[220px] w-px shrink-0 bg-white/80 lg:block"
                  aria-hidden="true"
                />

                <!-- Colonne droite : résumé commande -->
                <div class="flex w-full max-w-[420px] flex-col gap-8">
                  <h3
                    class="font-[Raleway,sans-serif] text-2xl font-bold leading-tight text-white md:text-[30px] md:leading-5"
                  >
                    Résumé de la commande
                  </h3>
                  <div class="flex flex-col gap-5 font-[Raleway,sans-serif] text-lg font-medium text-white">
                    <p>{{ recapSessionLine }}</p>
                    <div class="flex items-start gap-2.5">
                      <span class="mt-0.5 inline-flex h-[15px] w-[15px] shrink-0 text-white" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" stroke-linecap="round" />
                        </svg>
                      </span>
                      <span>{{ durationHours }}h</span>
                    </div>
                    <div class="flex items-start gap-2.5">
                      <span class="mt-0.5 inline-flex h-[15px] w-[15px] shrink-0 text-white" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="3" y="5" width="18" height="16" rx="2" />
                          <path d="M3 10h18" />
                          <path d="M8 3v4M16 3v4" stroke-linecap="round" />
                        </svg>
                      </span>
                      <span class="capitalize">{{ recapDateLabel }}</span>
                    </div>
                    <div class="flex items-start gap-2.5">
                      <span class="mt-0.5 inline-flex h-[15px] w-[15px] shrink-0 text-white" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" stroke-linecap="round" />
                        </svg>
                      </span>
                      <span>{{ recapTimeRangeLabel }}</span>
                    </div>
                  </div>
                  <p class="text-sm text-white/60">
                    Total {{ totalPrice }}€ · Acompte 30% {{ depositAmount }}€
                  </p>
                  <button
                    type="button"
                    class="w-full max-w-[280px] rounded-full border border-white/50 bg-transparent px-8 py-3 font-[Raleway,sans-serif] text-lg font-medium text-white transition hover:bg-white/10 disabled:opacity-40"
                    :disabled="paymentModalOpen || !canBook || sessionsLoading || uploadingProd"
                    @click="handleBook"
                  >
                    {{
                      uploadingProd
                        ? 'Envoi de la prod…'
                        : sessionsLoading
                          ? 'Patienter…'
                          : 'Confirmer et payer'
                    }}
                  </button>
                </div>
              </div>
            </div>
            <p v-else class="text-center text-sm text-white/70">
              Complète les étapes précédentes pour voir le récapitulatif.
            </p>
        </div>
        <div class="relative z-10 px-4 pb-8 sm:px-6">
          <p v-if="localError || sessionsError" class="text-sm text-red-400">
            {{ localError || sessionsError }}
          </p>
          <p v-if="success" class="text-sm text-emerald-400">
            {{ success }}
          </p>
        </div>
      </div>
    </template>

    <!-- Liste des sessions -->
    <div v-if="showMesSessions" class="space-y-4">
      <h2 class="pds-h2">Mes réservations</h2>
      <h3 class="pds-subtitle">Tes prochaines sessions</h3>
      <div v-if="sessionsLoading" class="text-sm text-[var(--pds-muted)]">Chargement...</div>
      <div
        v-else-if="Object.keys(groupedByDate).length === 0"
        class="text-sm text-[var(--pds-muted)]"
      >
        Aucune session. Réserve un créneau ci-dessus.
      </div>
      <div v-else class="space-y-3">
        <div v-for="(sessionsForDay, day) in groupedByDate" :key="day" class="pds-card">
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
                  <span
                    v-if="s.style"
                    class="ml-2 rounded bg-[var(--pds-border)] px-2 py-0.5 text-xs"
                    >{{ s.style }}</span
                  >
                  <span v-if="s.reservationName" class="ml-2 text-xs text-[var(--pds-muted)]"
                    >« {{ s.reservationName }} »</span
                  >
                  <span v-if="s.totalPrice" class="ml-2 text-sm text-[var(--pds-muted)]"
                    >{{ s.totalPrice }}€</span
                  >
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
                  <template v-if="s.status === 'waiting_payment'"> Attente paiement </template>
                  <template v-else-if="s.status === 'pending'"> En attente ingé </template>
                  <template v-else-if="s.status === 'confirmed'"> Confirmée </template>
                  <template v-else-if="s.status === 'done'"> Terminée </template>
                  <template v-else-if="s.status === 'cancelled'"> Annulée </template>
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
                <span
                  v-if="s.recapSentAt"
                  class="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300"
                >
                  Un récap a été envoyé par mail
                </span>
                <span>
                  Reste à payer :
                  <strong class="text-[var(--pds-text)]">{{ restToPayForSession(s) }}€</strong>
                </span>
              </div>
              <!-- Bloc paiement -->
              <div
                v-if="s.status === 'waiting_payment'"
                class="mt-3 border-t border-[var(--pds-border)] pt-3"
              >
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
                  <div
                    v-if="s.bookerProdUrl || s.beatTitle"
                    class="rounded border border-[var(--pds-border)] bg-[var(--pds-bg)] px-3 py-2"
                  >
                    <p class="text-xs font-medium text-[var(--pds-text)]">Prod de la session</p>
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
                  <div
                    class="rounded border border-[var(--pds-border)] bg-[var(--pds-bg)] px-3 py-2"
                  >
                    <p class="text-xs font-medium text-[var(--pds-text)]">
                      Fichiers rendus par l’ingé
                    </p>
                    <p v-if="filesLocalError || filesError" class="mt-1 text-xs text-red-400">
                      {{ filesLocalError || filesError }}
                    </p>
                    <p v-else-if="filesLoading" class="mt-1 text-xs text-[var(--pds-muted)]">
                      Chargement des fichiers...
                    </p>
                    <p
                      v-else-if="sessionFiles.length === 0"
                      class="mt-1 text-xs text-[var(--pds-muted)]"
                    >
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
