<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Session } from '../../composables/useSessions'
import { useSessions } from '../../composables/useSessions'
import { useAvailability, slotOverlapsAny } from '../../composables/useAvailability'
import { useAuth } from '../../composables/useAuth'

const props = defineProps<{
  variant: 'beatmaker' | 'inge'
}>()

const {
  sessions,
  loading,
  listForCurrentBeatmaker,
  listForCurrentInge,
  listAllPending,
  listAllUpcoming,
  updateSessionStatus,
  updateSessionRemainingToPay,
  updateSessionRecapSent,
} = useSessions()

const { getMySlotsForDate } = useAvailability()
const { currentUser } = useAuth()

/** Sessions pending ingé (même jeu que l’ancien écran « à confirmer »), fusionnées dans la liste à venir */
const pendingForConfirm = ref<Session[]>([])

const tab = ref<'upcoming' | 'past'>('upcoming')
const expandedId = ref<string | null>(null)
const cancellingId = ref<string | null>(null)
const confirmingId = ref<string | null>(null)
const markingPaidId = ref<string | null>(null)

const todayIso = () => new Date().toISOString().slice(0, 10)

function formatDateFr(iso: string) {
  const parts = iso.split('-').map(Number)
  const y = parts[0]!
  const m = parts[1]!
  const d = parts[2]!
  const date = new Date(y, m - 1, d)
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function displayName(s: Session) {
  return (s.reservationName && s.reservationName.trim()) || s.bookerEmail || 'Client'
}

function restToPay(s: Session): number {
  if (s.remainingToPay !== undefined && s.remainingToPay !== null) return s.remainingToPay
  return Math.max(0, (s.totalPrice ?? 0) - (s.depositAmount ?? 0))
}

const roleLabel = computed(() =>
  props.variant === 'beatmaker' ? 'Beatmaker' : 'Ingénieur son',
)

function isPendingIngeConfirm(s: Session) {
  return props.variant === 'inge' && s.status === 'pending'
}

async function loadPendingForConfirm() {
  pendingForConfirm.value = []
  if (props.variant !== 'inge') return
  const pending = await listAllPending()
  const filtered: Session[] = []
  for (const s of pending) {
    const mySlots = await getMySlotsForDate(s.date)
    const sessionSlot = { start: s.startTime, end: s.endTime }
    if (slotOverlapsAny(sessionSlot, mySlots)) filtered.push(s)
  }
  pendingForConfirm.value = filtered
}

const upcomingList = computed(() => {
  const t = todayIso()
  if (props.variant === 'beatmaker') {
    const list = sessions.value.filter(
      (s) => s.date >= t && s.status !== 'cancelled',
    )
    list.sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
    )
    return list
  }

  const assigned = sessions.value.filter(
    (s) => s.date >= t && s.status !== 'cancelled',
  )
  const ids = new Set(assigned.map((s) => s.id))
  const extra = pendingForConfirm.value.filter(
    (s) => !ids.has(s.id) && s.date >= t && s.status !== 'cancelled',
  )
  const merged = [...assigned, ...extra]
  merged.sort((a, b) => {
    const ap = a.status === 'pending' ? 0 : 1
    const bp = b.status === 'pending' ? 0 : 1
    if (ap !== bp) return ap - bp
    return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
  })
  return merged
})

const pastList = computed(() => {
  const t = todayIso()
  const list = sessions.value.filter(
    (s) => s.date < t || s.status === 'cancelled',
  )
  list.sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime),
  )
  return list
})

const displayedList = computed(() =>
  tab.value === 'upcoming' ? upcomingList.value : pastList.value,
)

async function reload() {
  if (props.variant === 'beatmaker') {
    await listForCurrentBeatmaker()
    return
  }
  await listForCurrentInge()
  await loadPendingForConfirm()
}

onMounted(reload)

async function confirmIngeSession(s: Session) {
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
    await listAllUpcoming()
    await reload()
    if (expandedId.value === s.id) expandedId.value = null
  } finally {
    confirmingId.value = null
  }
}

function toggleInfo(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

async function cancelSession(s: Session) {
  if (
    !confirm(
      'Annuler cette session ? Le booker sera informé selon votre process habituel.',
    )
  )
    return
  cancellingId.value = s.id
  try {
    await updateSessionStatus(s.id, 'cancelled')
    await reload()
    if (expandedId.value === s.id) expandedId.value = null
  } finally {
    cancellingId.value = null
  }
}

async function markFullyPaid(s: Session) {
  if (restToPay(s) === 0) return
  markingPaidId.value = s.id
  try {
    await updateSessionRemainingToPay(s.id, 0)
    await reload()
  } finally {
    markingPaidId.value = null
  }
}

function rowMuted(index: number) {
  if (tab.value === 'past') return false
  return index >= 2
}

function rowTextClass(muted: boolean) {
  return muted ? 'text-[#4C4C4C]' : 'text-white'
}
</script>

<template>
  <div
    class="dashboard-sessions relative min-h-[50vh] w-full min-w-0 max-w-[1440px] px-4 pb-16 pt-6 sm:px-8 md:px-[120px]"
  >
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#0073FF]/20 via-transparent to-transparent blur-3xl"
      aria-hidden="true"
    />

    <!-- Même hiérarchie que la maquette : onglets liste alignés à gauche, typo Raleway comme la nav -->
    <div class="mb-10 flex flex-wrap items-center justify-start gap-[15px]">
      <button
        type="button"
        class="pds-sessions-ui inline-flex h-[34px] min-w-[168px] items-center justify-center rounded-full px-8 text-center font-['Raleway',sans-serif] text-[17px] font-medium leading-none transition-colors sm:text-[18px]"
        :class="
          tab === 'upcoming'
            ? 'bg-gradient-to-r from-[#0073FF] to-[#64E8FF] text-[#0a1628] shadow-sm'
            : 'border border-white/45 bg-transparent text-white'
        "
        @click="tab = 'upcoming'"
      >
        À venir
      </button>
      <button
        type="button"
        class="pds-sessions-ui inline-flex h-[34px] min-w-[168px] items-center justify-center rounded-full px-8 text-center font-['Raleway',sans-serif] text-[17px] font-medium leading-none transition-colors sm:text-[18px]"
        :class="
          tab === 'past'
            ? 'border border-white/45 bg-gradient-to-r from-[#0073FF] to-[#64E8FF] text-[#0a1628] shadow-sm'
            : 'border border-white/45 bg-transparent text-white'
        "
        @click="tab = 'past'"
      >
        Passées
      </button>
    </div>

    <div class="flex flex-col gap-6 pb-8 md:gap-[25px] md:pt-[10px]">
      <div v-if="loading" class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/70">
        Chargement…
      </div>
      <template v-else-if="displayedList.length === 0">
        <p class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/60">
          {{
            tab === 'upcoming'
              ? 'Aucune session à venir.'
              : 'Aucune session passée.'
          }}
        </p>
      </template>
      <template v-else>
        <div
          v-for="(s, index) in displayedList"
          :key="s.id"
          class="max-w-[1200px]"
        >
          <div
            class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6"
          >
            <div
              class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-5"
            >
              <span
                class="mt-1 h-[9px] w-[9px] shrink-0 rounded-full"
                :class="
                  variant === 'inge' && s.status === 'pending'
                    ? 'bg-amber-400 shadow-[0_0_4px_#fbbf24]'
                    : 'bg-[#48FF37] shadow-[0_0_4px_#48FF37]'
                "
                aria-hidden="true"
              />
              <div
                class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-5"
              >
                <p
                  class="session-name flex min-w-0 flex-wrap items-baseline gap-2 truncate text-2xl leading-tight sm:text-[30px]"
                  :class="rowTextClass(rowMuted(index))"
                >
                  <span class="truncate">{{ displayName(s) }}</span>
                  <span
                    v-if="variant === 'inge' && s.status === 'pending'"
                    class="shrink-0 rounded-full border border-amber-400/50 px-2 py-0.5 font-['Raleway',sans-serif] text-[10px] font-medium uppercase tracking-wide text-amber-300 sm:text-[11px]"
                  >
                    À confirmer
                  </span>
                </p>
                <div
                  class="flex flex-wrap items-center gap-x-4 gap-y-1 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[13px] sm:text-[15px] sm:leading-[10px]"
                  :class="rowTextClass(rowMuted(index))"
                >
                  <span>{{ formatDateFr(s.date) }}</span>
                  <span>{{ s.startTime }} – {{ s.endTime }}</span>
                </div>
              </div>
            </div>

            <div
              class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 lg:gap-4"
            >
              <div
                class="flex flex-wrap items-center gap-4 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[13px] sm:text-[15px]"
                :class="rowTextClass(rowMuted(index))"
              >
                <span class="inline-flex items-center gap-2.5">
                  <svg
                    class="h-[11px] w-[11px] shrink-0"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
                    />
                  </svg>
                  {{ s.bookerPhone || '—' }}
                </span>
                <span
                  v-if="
                    tab === 'upcoming' &&
                    index === 0 &&
                    s.bookerEmail
                  "
                  class="inline-flex items-center gap-2.5"
                >
                  <svg
                    class="h-[15px] w-[15px] shrink-0"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
                    />
                  </svg>
                  <span class="min-w-0 max-w-[min(100%,220px)] truncate sm:max-w-[280px]">{{
                    s.bookerEmail
                  }}</span>
                </span>
              </div>

              <div
                class="flex flex-wrap items-center gap-3"
                :class="rowMuted(index) ? 'opacity-80' : ''"
              >
                <span
                  class="inline-flex h-[27px] items-center gap-1 rounded-full border border-white/50 px-[15px] py-1 font-['Raleway',sans-serif] text-[15px] font-medium text-white"
                  :class="rowTextClass(rowMuted(index))"
                >
                  <svg
                    v-if="variant === 'beatmaker'"
                    class="h-[25px] w-[26px] shrink-0"
                    viewBox="0 0 26 25"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <rect x="1" y="10" width="4" height="12" rx="1" />
                    <rect x="8" y="4" width="4" height="18" rx="1" />
                    <rect x="15" y="7" width="4" height="15" rx="1" />
                    <rect x="22" y="11" width="4" height="10" rx="1" />
                  </svg>
                  <svg
                    v-else
                    class="h-5 w-5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"
                    />
                  </svg>
                  {{ roleLabel }}
                </span>

                <template v-if="tab === 'upcoming'">
                  <button
                    v-if="variant === 'inge' && isPendingIngeConfirm(s)"
                    type="button"
                    class="pds-sessions-ui shrink-0 rounded-full bg-gradient-to-r from-[#0073FF] to-[#64E8FF] px-4 py-2 text-xs font-medium text-black transition hover:opacity-90 disabled:opacity-50 sm:text-sm"
                    :disabled="confirmingId === s.id"
                    @click="confirmIngeSession(s)"
                  >
                    {{ confirmingId === s.id ? 'Confirmation…' : 'Confirmer' }}
                  </button>
                  <template v-else>
                    <button
                      v-if="index === 0"
                      type="button"
                      class="pds-sessions-ui inline-flex h-[15px] min-w-[50px] items-center justify-center rounded-full bg-white px-2.5 font-['Raleway',sans-serif] text-[8px] font-medium leading-none text-black transition hover:bg-white/90 disabled:opacity-50"
                      :disabled="cancellingId === s.id"
                      @click="cancelSession(s)"
                    >
                      {{ cancellingId === s.id ? '…' : 'Annuler' }}
                    </button>
                    <button
                      v-else
                      type="button"
                      class="pds-sessions-ui flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-white/50 text-white transition hover:bg-white/10 disabled:opacity-50"
                      :disabled="cancellingId === s.id"
                      aria-label="Annuler la session"
                      @click="cancelSession(s)"
                    >
                      <span class="text-[10px] leading-none" aria-hidden="true">×</span>
                    </button>
                  </template>
                </template>

                <button
                  type="button"
                  class="pds-sessions-ui flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full text-current transition hover:opacity-80"
                  :class="rowTextClass(rowMuted(index))"
                  aria-label="Détails"
                  @click="toggleInfo(s.id)"
                >
                  <span class="text-[11px] font-semibold leading-none">i</span>
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="expandedId === s.id"
            class="mt-4 max-w-[1200px] rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-[13px] text-white/90"
          >
            <p v-if="variant === 'beatmaker'" class="space-y-1">
              <span class="block text-white/60">Style</span>
              {{ s.style || '—' }}
              <span v-if="s.beatTitle" class="mt-2 block">
                <span class="text-white/60">Prod</span> — {{ s.beatTitle }}
              </span>
            </p>
            <template v-else>
              <p class="mb-2 text-white/70">
                Statut :
                <strong class="text-white">{{ s.status }}</strong>
              </p>
              <div
                v-if="
                  (s.status === 'confirmed' || s.status === 'done') &&
                  restToPay(s) >= 0
                "
                class="flex flex-wrap items-center justify-between gap-2"
              >
                <span
                  >Reste à payer :
                  <strong>{{ restToPay(s) }}€</strong></span
                >
                <button
                  v-if="restToPay(s) > 0"
                  type="button"
                  class="pds-sessions-ui rounded-full border border-white/40 px-3 py-1 text-xs text-white transition hover:bg-white/10 disabled:opacity-50"
                  :disabled="markingPaidId === s.id"
                  @click="markFullyPaid(s)"
                >
                  {{ markingPaidId === s.id ? '…' : 'Marquer tout payé' }}
                </button>
              </div>
            </template>
          </div>

          <div
            class="mt-6 h-px w-full max-w-[1200px] bg-[#A5A5A5]"
            role="presentation"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.session-name {
  font-family: Raleway, system-ui, sans-serif;
  font-weight: 700;
}
</style>
