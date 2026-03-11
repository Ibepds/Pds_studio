<script setup lang="ts">
import { ref } from 'vue'
import { useSessions, type Session } from '../../composables/useSessions'
import { usePaypal } from '../../composables/usePaypal'

const activeTab = ref<'reserver' | 'payer'>('reserver')

const reservationSearch = ref('')
const searchResults = ref<Session[]>([])
const loadingSearch = ref(false)
const searchError = ref<string | null>(null)

const paypalError = ref<string | null>(null)
const paypalRenderedFor = ref<string | null>(null)

const { findUnpaidByReservationName, updateSessionStatus } = useSessions()

const depositForSession = (s: Session) =>
  s.depositAmount ?? Math.round((s.totalPrice ?? 50) * 0.3)

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
        },
        onError: () => {
          paypalError.value = 'Erreur lors du paiement PayPal.'
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
  <section class="pds-container py-10">
    <h1 class="pds-h2 mb-6 text-center">Réserver une session au studio PDS</h1>
    <p class="pds-subtitle mb-8 text-center">
      Réserve un créneau ou règle ton acompte même sans créer de compte. Tu recevras toutes les
      infos par email.
    </p>

    <div class="mx-auto max-w-4xl space-y-8">
      <div class="flex justify-center gap-3">
        <button
          type="button"
          class="btn-secondary"
          :class="{
            '!bg-[var(--pds-primary)] !text-white': activeTab === 'reserver',
          }"
          @click="activeTab = 'reserver'"
        >
          Réserver un créneau
        </button>
        <button
          type="button"
          class="btn-secondary"
          :class="{
            '!bg-[var(--pds-primary)] !text-white': activeTab === 'payer',
          }"
          @click="activeTab = 'payer'"
        >
          Payer sans se connecter
        </button>
      </div>

      <div v-if="activeTab === 'reserver'" class="mx-auto max-w-3xl">
        <Booker mode="reserver" />
      </div>

      <div v-else class="space-y-6">
        <div class="pds-card space-y-4">
          <h2 class="pds-subtitle">Payer une réservation existante</h2>
          <p class="text-sm text-[var(--pds-muted2)]">
            Si tu as réservé une session sans créer de compte, tu peux payer l’acompte en indiquant
            le <strong>nom de ta réservation</strong> (par exemple « Session EP », « Mix single
            », etc.).
          </p>
          <div class="space-y-2">
            <label class="pds-label">Nom de la réservation</label>
            <input
              v-model="reservationSearch"
              type="text"
              class="pds-input w-full max-w-md"
              placeholder="Nom que tu as indiqué lors de la réservation"
            />
          </div>
          <button
            type="button"
            class="btn-primary mt-2"
            :disabled="loadingSearch"
            @click="searchReservations"
          >
            {{ loadingSearch ? 'Recherche en cours...' : 'Rechercher la réservation' }}
          </button>
          <p v-if="searchError" class="mt-2 text-sm text-red-400">
            {{ searchError }}
          </p>
        </div>

        <div v-if="searchResults.length" class="space-y-4">
          <h3 class="pds-subtitle">Réservations trouvées</h3>
          <div class="space-y-3">
            <div
              v-for="s in searchResults"
              :key="s.id"
              class="pds-card space-y-2 border border-[var(--pds-border)]"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="space-y-1 text-sm">
                  <div class="font-medium text-[var(--pds-text)]">
                    {{ s.date }} — {{ s.startTime }}–{{ s.endTime }}
                  </div>
                  <div v-if="s.reservationName" class="text-xs text-[var(--pds-muted)]">
                    « {{ s.reservationName }} »
                  </div>
                  <div v-if="s.totalPrice" class="text-xs text-[var(--pds-muted2)]">
                    Prix total : {{ s.totalPrice }}€
                  </div>
                </div>
                <span class="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                  Attente paiement
                </span>
              </div>
              <div class="mt-2 border-t border-[var(--pds-border)] pt-3">
                <p class="mb-2 text-xs text-[var(--pds-muted)]">
                  Acompte à payer : <strong>{{ depositForSession(s) }}€</strong> (30% du total)
                </p>
                <button
                  type="button"
                  class="btn-secondary !py-2 !px-3 !text-sm"
                  @click="initPaypalGuest(s.id, depositForSession(s))"
                >
                  Payer l’acompte avec PayPal
                </button>
                <div :id="`paypal-button-guest-${s.id}`" class="mt-2" />
              </div>
            </div>
          </div>
          <p v-if="paypalError" class="mt-1 text-xs text-red-400">
            {{ paypalError }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
