<script setup lang="ts">
import { definePageMeta } from '#imports'
import { computed, ref, watch } from 'vue'
import type { Session } from '../../../composables/useSessions'
import { useSessions } from '../../../composables/useSessions'
import { useUsers } from '../../../composables/useUsers'
import { useAdminMonthNav } from '../../../composables/useAdminMonthNav'
import {
  getIngeEmailForSession,
  restToPayForSession,
} from '../../../composables/useAdminSessionHelpers'

definePageMeta({
  middleware: 'require-auth',
  role: 'admin',
})

const {
  listSessionsInDateRange,
  updateSessionRemainingToPay,
  updateSessionStatus,
  updateSessionRecapSent,
  updateSessionInge,
  saveCalendarEventId,
} = useSessions()
const { listByRole } = useUsers()
const { label, range, prevMonth, nextMonth, year, month } = useAdminMonthNav()

const sessions = ref<Session[]>([])
const ingeList = ref<{ uid: string; email?: string | null }[]>([])
const loading = ref(false)
const adminError = ref<string | null>(null)
const markingPaidId = ref<string | null>(null)
const confirmingId = ref<string | null>(null)
const cancellingId = ref<string | null>(null)
const expandedId = ref<string | null>(null)
const changingIngeForId = ref<string | null>(null)
const changeIngeUid = ref<Record<string, string>>({})
const savingIngeId = ref<string | null>(null)

/** Si pending sans ingéId : uid ingé choisi pour la confirmation */
const assignIngeUid = ref<Record<string, string>>({})

function syncAssignDefaults(list: Session[]) {
  const next: Record<string, string> = { ...assignIngeUid.value }
  const first = ingeList.value[0]?.uid ?? ''
  for (const s of list) {
    if (s.status === 'pending' && !s.ingeId && first) {
      if (next[s.id] === undefined || !ingeList.value.some((u) => u.uid === next[s.id])) {
        next[s.id] = first
      }
    }
  }
  assignIngeUid.value = next
}

async function loadMonth() {
  loading.value = true
  adminError.value = null
  try {
    const r = range.value
    const [s, i] = await Promise.all([
      listSessionsInDateRange(r.start, r.end),
      listByRole('inge'),
    ])
    sessions.value = s
    ingeList.value = i
    syncAssignDefaults(s)
  } catch (e: any) {
    adminError.value = e?.message ?? 'Erreur de chargement'
  } finally {
    loading.value = false
  }
}

watch([year, month], () => loadMonth(), { immediate: true })

const sortedSessions = computed(() => {
  const list = [...sessions.value]
  list.sort((a, b) => {
    const ap = a.status === 'pending' ? 0 : 1
    const bp = b.status === 'pending' ? 0 : 1
    if (ap !== bp) return ap - bp
    return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
  })
  return list
})

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

function rowMuted(index: number) {
  return index >= 2
}

function rowTextClass(muted: boolean) {
  return muted ? 'text-[#4C4C4C]' : 'text-white'
}

function canCancel(s: Session) {
  return s.status !== 'cancelled' && s.status !== 'done'
}

function canConfirm(s: Session) {
  return s.status === 'pending'
}

function resolveIngeIdForConfirm(s: Session): string | null {
  if (s.ingeId) return s.ingeId
  const pick = assignIngeUid.value[s.id]
  if (pick) return pick
  return ingeList.value[0]?.uid ?? null
}

async function confirmSession(s: Session) {
  const ingeId = resolveIngeIdForConfirm(s)
  if (!ingeId) {
    adminError.value = 'Aucun ingé son : ajoute un compte ingé ou assigne un ingé.'
    return
  }
  confirmingId.value = s.id
  adminError.value = null
  try {
    await updateSessionStatus(s.id, 'confirmed', undefined, ingeId)
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
      const calRes = await $fetch<{ ok: boolean; eventId?: string | null }>('/api/google-calendar-event', {
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
      if (calRes?.eventId) {
        await saveCalendarEventId(s.id, calRes.eventId)
      }
    } catch (e) {
      console.error('Google Calendar', e)
    }
    await loadMonth()
    if (expandedId.value === s.id) expandedId.value = null
  } catch (e: any) {
    adminError.value = e?.message ?? 'Erreur lors de la confirmation'
  } finally {
    confirmingId.value = null
  }
}

async function cancelSession(s: Session) {
  if (
    !confirm(
      'Annuler cette session ? Le booker sera informé selon votre process habituel.',
    )
  ) {
    return
  }
  cancellingId.value = s.id
  adminError.value = null
  try {
    await updateSessionStatus(s.id, 'cancelled')
    await loadMonth()
    if (expandedId.value === s.id) expandedId.value = null
  } catch (e: any) {
    adminError.value = e?.message ?? 'Erreur lors de l’annulation'
  } finally {
    cancellingId.value = null
  }
}

async function markFullyPaid(s: Session) {
  if (restToPayForSession(s) === 0) return
  markingPaidId.value = s.id
  adminError.value = null
  try {
    await updateSessionRemainingToPay(s.id, 0)
    await loadMonth()
  } catch (e: any) {
    adminError.value = e?.message ?? 'Erreur'
  } finally {
    markingPaidId.value = null
  }
}

function toggleInfo(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function openChangeInge(s: Session) {
  changingIngeForId.value = s.id
  changeIngeUid.value[s.id] = s.ingeId ?? ingeList.value[0]?.uid ?? ''
}

function cancelChangeInge() {
  changingIngeForId.value = null
}

async function saveChangeInge(s: Session) {
  const newUid = changeIngeUid.value[s.id]
  if (!newUid || newUid === s.ingeId) {
    changingIngeForId.value = null
    return
  }
  savingIngeId.value = s.id
  adminError.value = null
  try {
    await updateSessionInge(s.id, newUid)
    await loadMonth()
    changingIngeForId.value = null
  } catch (e: any) {
    adminError.value = e?.message ?? 'Erreur lors du changement d\'ingé'
  } finally {
    savingIngeId.value = null
  }
}

const sessionsByInge = computed(() => {
  const map: Record<string, { email: string; sessions: Session[] }> = {}
  for (const s of sessions.value) {
    if (!s.ingeId) continue
    const email = getIngeEmailForSession(s, ingeList.value)
    if (!map[s.ingeId]) {
      map[s.ingeId] = { email, sessions: [] }
    }
    const entry = map[s.ingeId]
    if (entry) entry.sessions.push(s)
  }
  for (const entry of Object.values(map)) {
    entry.sessions.sort(
      (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
    )
  }
  return map
})
</script>

<template>
  <AdminScreen title="Sessions">
    <div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p
        class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[11px] font-normal uppercase tracking-[0.14em] text-white/45"
      >
        Période
      </p>
      <AdminMonthPicker :label="label" @prev="prevMonth" @next="nextMonth" />
    </div>

    <p v-if="adminError" class="mb-6 text-sm text-red-400">
      {{ adminError }}
    </p>

    <div class="space-y-10">
      <div>
        <p
          class="mb-4 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[11px] font-normal uppercase tracking-[0.14em] text-white/45"
        >
          Liste
        </p>
        <div class="rounded-xl border border-white/15 bg-white/[0.04] p-5 sm:p-6">
          <h2 class="mb-6 font-['Raleway',sans-serif] text-[17px] font-medium text-white sm:text-[18px]">
            Toutes les sessions du mois
          </h2>

          <div v-if="loading" class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/70">
            Chargement…
          </div>
          <div
            v-else-if="sortedSessions.length === 0"
            class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/60"
          >
            Aucune session sur cette période.
          </div>
          <div v-else class="flex flex-col gap-6 pb-2 md:gap-[25px]">
            <div
              v-for="(s, index) in sortedSessions"
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
                      s.status === 'pending'
                        ? 'bg-amber-400 shadow-[0_0_4px_#fbbf24]'
                        : s.status === 'waiting_payment'
                          ? 'bg-orange-400/90 shadow-[0_0_4px_rgba(251,146,60,0.6)]'
                          : s.status === 'cancelled'
                            ? 'bg-red-500/80 shadow-[0_0_4px_#ef4444]'
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
                        v-if="s.status === 'pending'"
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
                    <span v-if="s.bookerEmail" class="inline-flex items-center gap-2.5">
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
                    <!-- Ingé : badge cliquable si ingé assigné, select inline si changement en cours -->
                    <template v-if="changingIngeForId === s.id">
                      <label class="sr-only" :for="'change-inge-' + s.id">Changer l'ingé</label>
                      <select
                        :id="'change-inge-' + s.id"
                        v-model="changeIngeUid[s.id]"
                        class="pds-sessions-ui max-w-[min(100%,240px)] rounded-lg border border-white/25 bg-black/50 px-2 py-1.5 text-xs text-white"
                      >
                        <option v-for="u in ingeList" :key="u.uid" :value="u.uid">
                          {{ u.email ?? u.uid }}
                        </option>
                      </select>
                      <button
                        type="button"
                        class="pds-sessions-ui shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20 disabled:opacity-50"
                        :disabled="savingIngeId === s.id"
                        @click="saveChangeInge(s)"
                      >
                        {{ savingIngeId === s.id ? '…' : 'Valider' }}
                      </button>
                      <button
                        type="button"
                        class="pds-sessions-ui text-xs text-white/50 transition hover:text-white/80"
                        @click="cancelChangeInge"
                      >
                        Annuler
                      </button>
                    </template>
                    <template v-else>
                      <button
                        v-if="s.ingeId && ingeList.length > 0"
                        type="button"
                        class="pds-sessions-ui inline-flex h-[27px] max-w-[200px] items-center gap-1.5 truncate rounded-full border border-white/50 px-[15px] py-1 font-['Raleway',sans-serif] text-[13px] font-medium transition hover:border-white/80 hover:bg-white/5"
                        :class="rowTextClass(rowMuted(index))"
                        :title="'Cliquer pour changer l\'ingé : ' + getIngeEmailForSession(s, ingeList)"
                        @click="openChangeInge(s)"
                      >
                        <svg
                          class="h-[14px] w-[14px] shrink-0"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"
                          />
                        </svg>
                        <span class="truncate">{{ getIngeEmailForSession(s, ingeList) }}</span>
                      </button>
                      <span
                        v-else-if="!s.ingeId && !canConfirm(s)"
                        class="inline-flex h-[27px] items-center gap-1 rounded-full border border-white/20 px-[15px] py-1 font-['Raleway',sans-serif] text-[13px] font-medium text-white/40"
                      >
                        <svg
                          class="h-[14px] w-[14px] shrink-0"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"
                          />
                        </svg>
                        Pas d'ingé
                      </span>
                    </template>

                    <div
                      v-if="canConfirm(s) && !s.ingeId && ingeList.length > 0"
                      class="flex max-w-full flex-col gap-1 sm:flex-row sm:items-center"
                    >
                      <label class="sr-only" :for="'inge-' + s.id">Ingé assigné</label>
                      <select
                        :id="'inge-' + s.id"
                        v-model="assignIngeUid[s.id]"
                        class="pds-sessions-ui max-w-[min(100%,240px)] rounded-lg border border-white/25 bg-black/50 px-2 py-1.5 text-xs text-white"
                      >
                        <option v-for="u in ingeList" :key="u.uid" :value="u.uid">
                          {{ u.email ?? u.uid }}
                        </option>
                      </select>
                    </div>

                    <button
                      v-if="canConfirm(s)"
                      type="button"
                      class="pds-sessions-ui shrink-0 rounded-full bg-gradient-to-r from-[#0073FF] to-[#64E8FF] px-4 py-2 text-xs font-medium text-black transition hover:opacity-90 disabled:opacity-50 sm:text-sm"
                      :disabled="confirmingId === s.id"
                      @click="confirmSession(s)"
                    >
                      {{ confirmingId === s.id ? 'Confirmation…' : 'Confirmer' }}
                    </button>

                    <template v-else-if="canCancel(s)">
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
                <p class="mb-2 text-white/70">
                  Statut :
                  <strong class="text-white">{{ s.status }}</strong>
                  <span v-if="getIngeEmailForSession(s, ingeList) !== '—'" class="ml-2">
                    · Ingé :
                    {{ getIngeEmailForSession(s, ingeList) }}
                  </span>
                </p>
                <div
                  class="mb-3 flex flex-wrap gap-x-6 gap-y-1 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[13px]"
                >
                  <span>Total : <strong>{{ s.totalPrice ?? '—' }}€</strong></span>
                  <span>Acompte : <strong>{{ s.depositAmount ?? '—' }}€</strong></span>
                  <span>Reste : <strong>{{ restToPayForSession(s) }}€</strong></span>
                  <span
                    >Récap mail :
                    <strong :class="s.recapSentAt ? 'text-emerald-400' : 'text-white/50'">{{
                      s.recapSentAt ? 'Oui' : 'Non'
                    }}</strong></span
                  >
                </div>
                <div
                  v-if="
                    (s.status === 'confirmed' || s.status === 'done') && restToPayForSession(s) > 0
                  "
                  class="flex flex-wrap items-center gap-2"
                >
                  <button
                    type="button"
                    class="pds-sessions-ui rounded-full border border-white/40 px-3 py-1 text-xs text-white transition hover:bg-white/10 disabled:opacity-50"
                    :disabled="markingPaidId === s.id"
                    @click="markFullyPaid(s)"
                  >
                    {{ markingPaidId === s.id ? '…' : 'Marquer tout payé' }}
                  </button>
                </div>
              </div>

              <div
                class="mt-6 h-px w-full max-w-[1200px] bg-[#A5A5A5]"
                role="presentation"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <p
          class="mb-4 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[11px] font-normal uppercase tracking-[0.14em] text-white/45"
        >
          Par ingé
        </p>
        <div class="rounded-xl border border-white/15 bg-white/[0.04] p-5 sm:p-6">
          <h2 class="mb-4 font-['Raleway',sans-serif] text-[17px] font-medium text-white sm:text-[18px]">
            Sessions par ingé son (mois sélectionné)
          </h2>
          <div
            v-if="Object.keys(sessionsByInge).length === 0"
            class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/55"
          >
            Aucune session avec ingé assigné sur cette période.
          </div>
          <div v-else class="space-y-4">
            <div
              v-for="(data, ingeId) in sessionsByInge"
              :key="ingeId"
              class="rounded-lg border border-white/12 bg-black/35 p-4"
            >
              <h4 class="mb-3 font-['Raleway',sans-serif] text-[15px] font-medium text-[#64E8FF]">
                {{ data.email }}
              </h4>
              <ul class="space-y-2 text-[13px] text-white/80">
                <li
                  v-for="sess in data.sessions"
                  :key="sess.id"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/5 pb-2 last:border-0 last:pb-0"
                >
                  <span class="text-white/90">{{ sess.date }}</span>
                  <span>{{ sess.startTime }} – {{ sess.endTime }}</span>
                  <span class="text-white/50">{{ sess.bookerEmail ?? sess.bookerId }}</span>
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                    :class="{
                      'bg-amber-500/20 text-amber-200': sess.status === 'pending',
                      'bg-emerald-500/20 text-emerald-200': sess.status === 'confirmed',
                      'bg-slate-500/25 text-slate-200': sess.status === 'done',
                    }"
                  >
                    {{ sess.status }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AdminScreen>
</template>

<style scoped>
.session-name {
  font-family: Raleway, system-ui, sans-serif;
  font-weight: 700;
}
</style>
