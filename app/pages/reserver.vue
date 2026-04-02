<script setup lang="ts">
import { onBeforeUnmount, ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { navigateTo } from '#app'
import { useSessions, type Session } from '../../composables/useSessions'
import { usePaypal } from '../../composables/usePaypal'
import type { BookingKindOption } from '../types/bookingKind'

const route = useRoute()
const activeTab = ref<'reserver' | 'payer'>('reserver')
/** Après l’étape visuelle Beatmaker / Ingé */
const bookingKind = ref<BookingKindOption | null>(null)

function kindFromQuery(q: unknown): BookingKindOption | null {
  const k = Array.isArray(q) ? q[0] : q
  if (k === 'beatmaker' || k === 'inge') return k
  return null
}

function applyKindFromRoute() {
  const k = kindFromQuery(route.query.kind)
  if (k) {
    bookingKind.value = k
    activeTab.value = 'reserver'
  }
}

onMounted(applyKindFromRoute)
watch(() => route.query.kind, applyKindFromRoute)

const reservationSearch = ref('')
const searchResults = ref<Session[]>([])
const loadingSearch = ref(false)
const searchError = ref<string | null>(null)

const paypalError = ref<string | null>(null)
const paypalRenderedFor = ref<string | null>(null)

type PaymentResult = 'success' | 'error'
const paymentResult = ref<PaymentResult | null>(null)
let paymentResultTimer: number | null = null

function clearPaymentResultTimer() {
  if (paymentResultTimer != null) {
    clearTimeout(paymentResultTimer)
    paymentResultTimer = null
  }
}

function goHomeNow() {
  clearPaymentResultTimer()
  paymentResult.value = null
  navigateTo('/')
}

function showPaymentResult(result: PaymentResult) {
  paymentResult.value = result
  clearPaymentResultTimer()
  paymentResultTimer = window.setTimeout(() => {
    paymentResult.value = null
    navigateTo('/')
  }, 6000)
}

onBeforeUnmount(() => {
  clearPaymentResultTimer()
})

const { findUnpaidByReservationName, updateSessionStatus } = useSessions()

const depositForSession = (s: Session) =>
  s.depositAmount ?? Math.round((s.totalPrice ?? 50) * 0.3)

function onKindContinue(kind: BookingKindOption) {
  bookingKind.value = kind
}

function backToKindPick() {
  bookingKind.value = null
}

function onBookerBooked() {
  bookingKind.value = null
}

const searchReservations = async () => {
  searchError.value = null
  paypalError.value = null
  paypalRenderedFor.value = null
  loadingSearch.value = true
  searchResults.value = []
  const name = reservationSearch.value.trim()
  if (!name) {
    searchError.value = 'Renseigne le nom de ta réservation.'
    loadingSearch.value = false
    return
  }
  try {
    const sessions = await findUnpaidByReservationName(name)
    if (!sessions.length) {
      searchError.value =
        "Aucune réservation en attente de paiement trouvée avec ce nom. Vérifie l'orthographe ou contacte le studio."
    } else {
      searchResults.value = sessions
    }
  } catch (e: any) {
    searchError.value = e?.message ?? 'Erreur lors de la recherche de la réservation.'
  } finally {
    loadingSearch.value = false
  }
}

const initPaypalGuest = async (sessionId: string, deposit: number) => {
  paypalError.value = null
  try {
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
          try {
            await updateSessionStatus(sessionId, 'pending', orderId)
          } catch (e) {
            console.error(e)
          }
          showPaymentResult('success')
        },
        onError: () => {
          paypalError.value = 'Erreur lors du paiement PayPal.'
          showPaymentResult('error')
        },
      })
      .render(`#paypal-button-guest-${sessionId}`)
    paypalRenderedFor.value = sessionId
  } catch (e: any) {
    paypalError.value = e?.message ?? 'Impossible de charger PayPal.'
  }
}
</script>

<template>
  <div class="reserver-page">
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

    <!-- Bandeau d’onglets (masqué sur la hero plein écran initiale) -->
    <div
      v-if="bookingKind || activeTab === 'payer'"
      class="sticky top-[3.25rem] z-40 border-b border-white/10 bg-black/85 backdrop-blur-md sm:top-[4.25rem]"
    >
      <div class="mx-auto flex max-w-4xl justify-center gap-2 px-4 py-3 sm:gap-3">
        <button
          type="button"
          class="rounded-full border px-4 py-2 text-sm font-medium transition-colors sm:px-5"
          :class="
            activeTab === 'reserver'
              ? 'border-[var(--pds-primary)] bg-[var(--pds-primary)]/20 text-white'
              : 'border-white/20 text-white/70 hover:border-white/40 hover:text-white'
          "
          @click="activeTab = 'reserver'"
        >
          Réserver
        </button>
        <button
          type="button"
          class="rounded-full border px-4 py-2 text-sm font-medium transition-colors sm:px-5"
          :class="
            activeTab === 'payer'
              ? 'border-[var(--pds-primary)] bg-[var(--pds-primary)]/20 text-white'
              : 'border-white/20 text-white/70 hover:border-white/40 hover:text-white'
          "
          @click="activeTab = 'payer'"
        >
          Payer sans compte
        </button>
      </div>
    </div>

    <!-- Tab réservation -->
    <template v-if="activeTab === 'reserver'">
      <div v-if="!bookingKind" class="relative">
        <BookingKindLanding variant="buttons" @choose="onKindContinue" />
        <p class="pointer-events-auto absolute bottom-6 left-0 right-0 z-20 text-center sm:bottom-10">
          <button
            type="button"
            class="text-sm text-white/70 transition-colors hover:text-white"
            @click="activeTab = 'payer'"
          >
            Payer un acompte sans compte →
          </button>
        </p>
      </div>
      <div v-else class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <button
          type="button"
          class="mb-8 text-sm text-[var(--pds-muted)] transition-colors hover:text-[var(--pds-primary)]"
          @click="backToKindPick"
        >
          ← Changer le type de session
        </button>
        <Booker
          mode="reserver"
          :booking-kind="bookingKind"
          @booked="onBookerBooked"
          @back-kind="backToKindPick"
        />
      </div>
    </template>

    <!-- Tab paiement invité -->
    <div
      v-else
      class="relative -mx-4 overflow-hidden rounded-2xl sm:-mx-6 min-h-[calc(100dvh-160px)]"
    >
      <div class="pointer-events-none absolute inset-0 min-h-[620px]">
        <FigmaLandingBackground variant="slot" />
      </div>
      <div class="relative z-10 px-4 py-10 sm:px-6 sm:py-14">
        <div class="mx-auto max-w-[1100px] space-y-10">
          <div>
            <h2
              class="font-[Raleway,sans-serif] text-3xl font-extrabold uppercase leading-none tracking-tight text-white sm:text-4xl md:text-[50px] md:leading-[0.76]"
            >
              Payer sans compte
            </h2>
            <p class="mt-3 text-sm text-[var(--pds-muted2)] sm:text-base">
              Indique le <strong>nom de ta réservation</strong> tel que saisi lors de la réservation.
            </p>
          </div>

          <!-- Bloc recherche -->
          <div class="rounded-2xl border border-[var(--pds-border)] bg-[rgba(21,21,21,0.6)] p-6 sm:p-8">
            <div class="space-y-2">
              <label class="font-[Raleway,sans-serif] text-lg font-medium text-white/70">
                Nom de la réservation
              </label>
              <input
                v-model="reservationSearch"
                type="text"
                autocomplete="off"
                class="h-[49px] w-full min-w-0 rounded-full border border-white/50 bg-[#0f0f0f] px-5 font-[Raleway,sans-serif] text-lg font-medium text-white outline-none placeholder:text-white/25 focus:border-white/70"
                placeholder="Ex. Session EP, Mix single…"
              />
            </div>
            <button
              type="button"
              class="mt-4 rounded-full border border-white/50 bg-transparent px-8 py-3 font-[Raleway,sans-serif] text-lg font-medium text-white transition hover:bg-white/10 disabled:opacity-40"
              :disabled="loadingSearch"
              @click="searchReservations"
            >
              {{ loadingSearch ? 'Recherche…' : 'Rechercher' }}
            </button>
            <p v-if="searchError" class="mt-2 text-sm text-red-400">
              {{ searchError }}
            </p>
          </div>

          <!-- Résultats -->
          <div v-if="searchResults.length" class="space-y-6">
            <h3 class="font-[Raleway,sans-serif] text-2xl font-bold text-white">Réservations trouvées</h3>
            <div class="space-y-4">
              <div
                v-for="s in searchResults"
                :key="s.id"
                class="rounded-2xl border border-[var(--pds-border)] bg-[var(--pds-bg)] p-6"
              >
                <div class="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
                  <!-- Colonne gauche : info -->
                  <div class="flex w-full flex-col gap-5 lg:max-w-[420px]">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <h3 class="font-[Raleway,sans-serif] text-2xl font-bold leading-tight text-white">
                        Information Artiste
                      </h3>
                      <span class="rounded-full bg-red-500/20 px-3 py-0.5 text-xs text-red-300">
                        Attente paiement
                      </span>
                    </div>

                    <dl class="flex flex-col gap-4 font-[Raleway,sans-serif] text-lg font-medium text-white">
                      <div class="flex flex-col gap-1">
                        <dt class="text-white/60">Nom réservation</dt>
                        <dd class="break-all text-white/90">{{ s.reservationName ?? '—' }}</dd>
                      </div>
                      <div class="flex flex-col gap-1">
                        <dt class="text-white/60">Email</dt>
                        <dd class="break-all text-white/90">{{ s.bookerEmail ?? '—' }}</dd>
                      </div>
                      <div class="flex flex-col gap-1">
                        <dt class="text-white/60">Téléphone</dt>
                        <dd class="break-all text-white/90">{{ s.bookerPhone ?? '—' }}</dd>
                      </div>
                      <div v-if="s.bookerNotes?.trim()" class="flex flex-col gap-1">
                        <dt class="text-white/60">Informations complémentaires</dt>
                        <dd class="whitespace-pre-wrap text-white/90">{{ s.bookerNotes }}</dd>
                      </div>
                    </dl>
                  </div>

                  <!-- Séparateur desktop -->
                  <div class="hidden h-auto min-h-[220px] w-px shrink-0 bg-white/30 lg:block" aria-hidden="true" />

                  <!-- Colonne droite : résumé -->
                  <div class="flex w-full flex-col gap-5 lg:max-w-[420px]">
                    <h3 class="font-[Raleway,sans-serif] text-2xl font-bold leading-tight text-white">
                      Résumé de la commande
                    </h3>

                    <div class="flex flex-col gap-3 font-[Raleway,sans-serif] text-lg font-medium text-white">
                      <p class="text-white/90">
                        {{ s.date }} — {{ s.startTime }}–{{ s.endTime }}
                      </p>
                      <p class="text-sm text-white/60">
                        Studio : <strong class="text-white/90">{{ s.style }}</strong>
                      </p>
                      <p class="text-sm text-white/60">
                        Total : <strong class="text-white/90">{{ s.totalPrice ?? 0 }}€</strong> · Acompte 30%
                        <strong class="text-white/90">{{ depositForSession(s) }}€</strong>
                      </p>
                    </div>

                    <div class="mt-3">
                      <button
                        type="button"
                        class="w-full rounded-full border border-white/50 bg-transparent px-8 py-3 font-[Raleway,sans-serif] text-lg font-medium text-white transition hover:bg-white/10 disabled:opacity-40"
                        @click="initPaypalGuest(s.id, depositForSession(s))"
                      >
                        Confirmer et payer
                      </button>
                      <div :id="`paypal-button-guest-${s.id}`" class="mt-3" />
                      <p class="mt-2 text-xs text-white/60">
                        Paiement avec PayPal (acompte).
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p v-if="paypalError" class="mt-1 text-sm text-red-400">
              {{ paypalError }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
