<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSessions } from '../../composables/useSessions'
import { useAuth } from '../../composables/useAuth'

const {
  sessions,
  listAllUpcoming,
  updateSessionRemainingToPay,
  loading: sessionsLoading,
} = useSessions()
const { currentUser } = useAuth()

const selectedSessionId = ref<string | null>(null)
const markingPaidId = ref<string | null>(null)

function restToPay(s: any): number {
  if (s.remainingToPay !== undefined && s.remainingToPay !== null) return s.remainingToPay
  return Math.max(0, (s.totalPrice ?? 0) - (s.depositAmount ?? 0))
}

async function markFullyPaid(s: any) {
  if (restToPay(s) === 0) return
  markingPaidId.value = s.id
  try {
    await updateSessionRemainingToPay(s.id, 0)
    await listAllUpcoming()
  } finally {
    markingPaidId.value = null
  }
}

const myUpcomingSessions = computed(() => {
  const uid = currentUser.value?.uid
  if (!uid) return []
  return sessions.value.filter((s) => s.ingeId === uid)
})

onMounted(listAllUpcoming)

function selectSession(id: string) {
  selectedSessionId.value = id
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="pds-h2">Sessions à venir</h2>

    <div class="pds-card space-y-3">
      <h3 class="pds-subtitle">Calendrier semaine</h3>
      <WeekCalendar :sessions="myUpcomingSessions" />
    </div>

    <div class="pds-card space-y-3">
      <h3 class="pds-subtitle">Liste des sessions</h3>
      <div v-if="sessionsLoading" class="text-sm text-[var(--pds-muted)]">
        Chargement des sessions...
      </div>
      <div v-else-if="myUpcomingSessions.length === 0" class="text-sm text-[var(--pds-muted)]">
        Aucune session à venir pour le moment.
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="s in myUpcomingSessions"
          :key="s.id"
          class="rounded-lg border px-3 py-2 transition-colors"
          :class="[
            selectedSessionId === s.id
              ? 'border-[var(--pds-primary)] bg-[var(--pds-primary)]/10'
              : 'border-[var(--pds-border)] bg-[var(--pds-bg)]',
          ]"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between text-left text-sm"
            @click="selectSession(s.id)"
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
                'bg-red-500/20 text-red-300': s.status === 'waiting_payment',
                'bg-amber-500/20 text-amber-300': s.status === 'pending',
                'bg-emerald-500/20 text-emerald-300': s.status === 'confirmed',
                'bg-slate-500/20 text-slate-300': s.status === 'done',
                'bg-red-800/20 text-red-200': s.status === 'cancelled',
              }"
            >
              {{
                s.status === 'waiting_payment'
                  ? 'Attente paiement'
                  : s.status === 'pending'
                    ? 'En attente ingé'
                    : s.status === 'confirmed'
                      ? 'Confirmée'
                      : s.status === 'done'
                        ? 'Terminée'
                        : s.status === 'cancelled'
                          ? 'Annulée'
                          : s.status
              }}
            </span>
          </button>
          <div
            v-if="(s.status === 'confirmed' || s.status === 'done') && restToPay(s) >= 0"
            class="mt-2 flex items-center justify-between border-t border-[var(--pds-border)] pt-2 text-xs text-[var(--pds-muted)]"
          >
            <span
              >Reste à payer :
              <strong class="text-[var(--pds-text)]">{{ restToPay(s) }}€</strong></span
            >
            <button
              v-if="restToPay(s) > 0"
              type="button"
              class="btn-secondary !py-1 !px-2 !text-xs"
              :disabled="markingPaidId === s.id"
              @click.stop="markFullyPaid(s)"
            >
              {{ markingPaidId === s.id ? '…' : 'Marquer tout payé' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
