<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSessions } from '../../composables/useSessions'
import { useAvailability, slotOverlapsAny } from '../../composables/useAvailability'
import { useAuth } from '../../composables/useAuth'
import type { Session } from '../../composables/useSessions'

const { listAllPending, listAllUpcoming, updateSessionStatus, updateSessionRecapSent } = useSessions()
const { getMySlotsForDate } = useAvailability()
const { currentUser } = useAuth()

const sessionsToConfirm = ref<Session[]>([])
const loadingSessionsToConfirm = ref(false)
const confirmingId = ref<string | null>(null)

async function loadSessionsToConfirm() {
  loadingSessionsToConfirm.value = true
  try {
    const pending = await listAllPending()
    const filtered: Session[] = []
    for (const s of pending) {
      const myUnavailability = await getMySlotsForDate(s.date)
      const sessionSlot = { start: s.startTime, end: s.endTime }
      if (!slotOverlapsAny(sessionSlot, myUnavailability)) filtered.push(s)
    }
    sessionsToConfirm.value = filtered
  } finally {
    loadingSessionsToConfirm.value = false
  }
}

async function confirmSession(s: Session) {
  const uid = currentUser.value?.uid
  if (!uid) return
  confirmingId.value = s.id
  try {
    await updateSessionStatus(s.id, 'confirmed', undefined, uid)
    try {
      await $fetch('/api/send-recap', {
        method: 'POST',
        body: {
          session: {
            id: s.id,
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            bookerEmail: s.bookerEmail ?? null,
            depositAmount: s.depositAmount,
            totalPrice: s.totalPrice,
            remainingToPay: s.remainingToPay,
          },
        },
      })
      await updateSessionRecapSent(s.id)
    } catch (e) {
      console.error('Send recap', e)
    }
    try {
      await $fetch('/api/google-calendar-event', {
        method: 'POST',
        body: {
          session: {
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            bookerEmail: s.bookerEmail ?? null,
            style: s.style,
          },
        },
      })
    } catch (e) {
      console.error('Google Calendar', e)
    }
    sessionsToConfirm.value = sessionsToConfirm.value.filter((x) => x.id !== s.id)
    await listAllUpcoming()
  } finally {
    confirmingId.value = null
  }
}

onMounted(loadSessionsToConfirm)
</script>

<template>
  <div class="pds-card space-y-3">
    <h2 class="pds-h2">
      Sessions à confirmer
    </h2>
    <p class="text-sm text-[var(--pds-muted)]">
      Ces réservations tombent sur des créneaux où tu es dispo (hors de tes indisponibilités). Confirme pour les valider.
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
          @click="confirmSession(s)"
        >
          {{ confirmingId === s.id ? 'Confirmation...' : 'Confirmer la session' }}
        </button>
      </div>
    </div>
  </div>
</template>
