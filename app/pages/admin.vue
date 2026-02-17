<script setup lang="ts">
import { definePageMeta } from '#imports'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'
import { useSessions } from '../../composables/useSessions'
import { useUsers } from '../../composables/useUsers'

const { currentUser } = useAuth()
const { listAllFromDate, updateSessionRemainingToPay } = useSessions()
const { listByRole, deleteUser } = useUsers()

function restToPayForSession(s: any): number {
  if (s.remainingToPay !== undefined && s.remainingToPay !== null) return s.remainingToPay
  return Math.max(0, (s.totalPrice ?? 0) - (s.depositAmount ?? 0))
}

const sessions = ref<any[]>([])
const ingeList = ref<any[]>([])
const beatmakerList = ref<any[]>([])
const loading = ref(true)
const deletingUid = ref<string | null>(null)
const adminError = ref<string | null>(null)
const markingPaidId = ref<string | null>(null)

async function markFullyPaid(s: any) {
  if (restToPayForSession(s) === 0) return
  markingPaidId.value = s.id
  adminError.value = null
  try {
    await updateSessionRemainingToPay(s.id, 0)
    const updated = await listAllFromDate(firstDayOfMonth.value)
    sessions.value = updated
  } catch (e: any) {
    adminError.value = e?.message ?? 'Erreur'
  } finally {
    markingPaidId.value = null
  }
}

const firstDayOfMonth = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
})

const sessionsThisMonth = computed(() => {
  const start = firstDayOfMonth.value
  const parts = start.split('-').map(Number)
  const y = parts[0] ?? 0
  const m = parts[1] ?? 0
  const endDay = new Date(y, m, 0).getDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
  return sessions.value.filter((s) => s.date >= start && s.date <= end)
})

const restToPayTotal = computed(() => {
  return sessions.value.reduce((sum, s) => {
    if (s.status === 'pending' || s.status === 'confirmed') return sum + restToPayForSession(s)
    return sum
  }, 0)
})

const totalMoneyThisMonth = computed(() => {
  return sessionsThisMonth.value
    .filter((s) => s.status === 'confirmed' || s.status === 'done')
    .reduce((sum, s) => sum + (s.totalPrice ?? 0), 0)
})

const confirmedByIngeCount = computed(() => {
  return sessions.value.filter((s) => s.ingeId).length
})

/** Email de l’ingé pour une session (à partir de ingeList) */
function getIngeEmailForSession(session: any): string {
  if (!session?.ingeId) return '—'
  const inge = ingeList.value.find((i) => i.uid === session.ingeId)
  return inge?.email ?? session.ingeId
}

/** Sessions groupées par ingé (ingeId) pour la liste “Sessions par ingé son” */
const sessionsByInge = computed(() => {
  const map: Record<string, { email: string; sessions: any[] }> = {}
  for (const s of sessions.value) {
    if (!s.ingeId) continue
    const email = getIngeEmailForSession(s)
    if (!map[s.ingeId]) {
      map[s.ingeId] = { email, sessions: [] }
    }
    const entry = map[s.ingeId]
    if (entry) entry.sessions.push(s)
  }
  for (const entry of Object.values(map)) {
    entry.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  }
  return map
})

async function handleDeleteUser(uid: string, role: string) {
  if (!confirm(`Supprimer ce compte ${role} ? Il perdra son rôle et sera considéré comme booker à la prochaine connexion.`)) {
    return
  }
  deletingUid.value = uid
  adminError.value = null
  try {
    await deleteUser(uid)
    ingeList.value = await listByRole('inge')
    beatmakerList.value = await listByRole('beatmaker')
  } catch (e: any) {
    adminError.value = e?.message ?? 'Erreur lors de la suppression'
  } finally {
    deletingUid.value = null
  }
}

definePageMeta({
  middleware: 'require-auth',
  role: 'admin',
})

const router = useRouter()
onMounted(async () => {
  loading.value = true
  try {
    const [s, i, b] = await Promise.all([
      listAllFromDate(firstDayOfMonth.value),
      listByRole('inge'),
      listByRole('beatmaker'),
    ])
    sessions.value = s
    ingeList.value = i
    beatmakerList.value = b
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-8">
    <h1 class="pds-h2">
      Admin
    </h1>

    <div v-if="currentUser?.role !== 'admin'" class="pds-card">
      <p class="text-red-400">
        Accès réservé aux administrateurs.
      </p>
    </div>

    <template v-else>
      <p v-if="adminError" class="text-sm text-red-400">
        {{ adminError }}
      </p>
      <div class="pds-card">
        <h3 class="pds-subtitle mb-3">
          Calendrier semaine
        </h3>
        <WeekCalendar :sessions="sessions" />
      </div>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="pds-card">
          <h3 class="pds-subtitle mb-1">
            Reste à payer (total)
          </h3>
          <p class="text-2xl font-medium text-[var(--pds-primary)]">
            {{ restToPayTotal }}€
          </p>
        </div>
        <div class="pds-card">
          <h3 class="pds-subtitle mb-1">
            Total du mois (confirmées / faites)
          </h3>
          <p class="text-2xl font-medium text-[var(--pds-primary)]">
            {{ totalMoneyThisMonth }}€
          </p>
        </div>
        <div class="pds-card">
          <h3 class="pds-subtitle mb-1">
            Sessions confirmées par un ingé
          </h3>
          <p class="text-2xl font-medium text-[var(--pds-primary)]">
            {{ confirmedByIngeCount }}
          </p>
        </div>
        <div class="pds-card">
          <h3 class="pds-subtitle mb-1">
            Sessions ce mois
          </h3>
          <p class="text-2xl font-medium text-[var(--pds-primary)]">
            {{ sessionsThisMonth.length }}
          </p>
        </div>
      </div>

      <div class="pds-card">
        <h3 class="pds-subtitle mb-4">
          Toutes les sessions (à partir de ce mois)
        </h3>
        <div v-if="loading" class="text-sm text-[var(--pds-muted)]">
          Chargement...
        </div>
        <div v-else-if="sessions.length === 0" class="text-sm text-[var(--pds-muted)]">
          Aucune session.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-[var(--pds-border)]">
                <th class="p-2">Date</th>
                <th class="p-2">Horaire</th>
                <th class="p-2">Booker</th>
                <th class="p-2">Statut</th>
                <th class="p-2">Ingé</th>
                <th class="p-2">Total</th>
                <th class="p-2">Acompte</th>
                <th class="p-2">Reste</th>
                <th class="p-2">Récap mail</th>
                <th class="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in sessions"
                :key="s.id"
                class="border-b border-[var(--pds-border)]"
              >
                <td class="p-2">{{ s.date }}</td>
                <td class="p-2">{{ s.startTime }} – {{ s.endTime }}</td>
                <td class="p-2">{{ s.bookerEmail ?? s.bookerId }}</td>
                <td class="p-2">
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
                </td>
                <td class="p-2">{{ getIngeEmailForSession(s) }}</td>
                <td class="p-2">{{ s.totalPrice ?? '—' }}€</td>
                <td class="p-2">{{ s.depositAmount ?? '—' }}€</td>
                <td class="p-2">
                  {{ restToPayForSession(s) }}€
                </td>
                <td class="p-2">
                  <span v-if="s.recapSentAt" class="text-emerald-400">Oui</span>
                  <span v-else class="text-[var(--pds-muted)]">Non</span>
                </td>
                <td class="p-2">
                  <button
                    v-if="(s.status === 'confirmed' || s.status === 'done') && restToPayForSession(s) > 0"
                    type="button"
                    class="btn-secondary !py-1 !px-2 !text-xs"
                    :disabled="markingPaidId === s.id"
                    @click="markFullyPaid(s)"
                  >
                    {{ markingPaidId === s.id ? '…' : 'Tout payé' }}
                  </button>
                  <span v-else-if="(s.status === 'confirmed' || s.status === 'done') && restToPayForSession(s) === 0" class="text-xs text-emerald-400">0€</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="pds-card">
        <h3 class="pds-subtitle mb-4">
          Sessions par ingé son
        </h3>
        <div v-if="Object.keys(sessionsByInge).length === 0" class="text-sm text-[var(--pds-muted)]">
          Aucune session confirmée par un ingé pour l’instant.
        </div>
        <div v-else class="space-y-4">
          <div
            v-for="(data, ingeId) in sessionsByInge"
            :key="ingeId"
            class="rounded-lg border border-[var(--pds-border)] bg-[var(--pds-bg)] p-4"
          >
            <h4 class="mb-2 font-medium text-[var(--pds-primary)]">
              {{ data.email }}
            </h4>
            <ul class="space-y-1 text-sm">
              <li
                v-for="s in data.sessions"
                :key="s.id"
                class="flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <span>{{ s.date }}</span>
                <span>{{ s.startTime }} – {{ s.endTime }}</span>
                <span class="text-[var(--pds-muted)]">{{ s.bookerEmail ?? s.bookerId }}</span>
                <span
                  class="rounded-full px-2 py-0.5 text-xs"
                  :class="{
                    'bg-amber-500/20 text-amber-300': s.status === 'pending',
                    'bg-emerald-500/20 text-emerald-300': s.status === 'confirmed',
                    'bg-slate-500/20 text-slate-300': s.status === 'done',
                  }"
                >
                  {{ s.status }}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="pds-card">
          <h3 class="pds-subtitle mb-4">
            Ingés son
          </h3>
          <ul class="space-y-2 text-sm">
            <li v-for="u in ingeList" :key="u.uid" class="flex items-center justify-between gap-2">
              <span>{{ u.email ?? u.uid }}</span>
              <button
                type="button"
                class="btn-secondary !py-1.5 !px-3 !text-xs text-red-400 hover:border-red-500 hover:text-red-300"
                :disabled="deletingUid === u.uid"
                @click="handleDeleteUser(u.uid, 'ingé son')"
              >
                {{ deletingUid === u.uid ? '…' : 'Supprimer' }}
              </button>
            </li>
            <li v-if="ingeList.length === 0" class="text-[var(--pds-muted)]">
              Aucun
            </li>
          </ul>
        </div>
        <div class="pds-card">
          <h3 class="pds-subtitle mb-4">
            Beatmakers
          </h3>
          <ul class="space-y-2 text-sm">
            <li v-for="u in beatmakerList" :key="u.uid" class="flex items-center justify-between gap-2">
              <span>{{ u.email ?? u.uid }}</span>
              <button
                type="button"
                class="btn-secondary !py-1.5 !px-3 !text-xs text-red-400 hover:border-red-500 hover:text-red-300"
                :disabled="deletingUid === u.uid"
                @click="handleDeleteUser(u.uid, 'beatmaker')"
              >
                {{ deletingUid === u.uid ? '…' : 'Supprimer' }}
              </button>
            </li>
            <li v-if="beatmakerList.length === 0" class="text-[var(--pds-muted)]">
              Aucun
            </li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>
