<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Session } from '../../composables/useSessions'
import { useSessions } from '../../composables/useSessions'
import { useSessionFiles } from '../../composables/useSessionFiles'
import { useAvailability, slotOverlapsAny } from '../../composables/useAvailability'

const { sessions, loading, listForCurrentInge, listAllPending } = useSessions()
const { getMySlotsForDate } = useAvailability()

/** Même fusion que l’écran Sessions : assignées + en attente qui chevauchent tes dispos (sans ingeId encore). */
const pendingForConfirm = ref<Session[]>([])
const {
  files: sessionFiles,
  loading: filesLoading,
  error: filesError,
  listForSession,
  uploadForSession,
} = useSessionFiles()

const selectedSessionId = ref<string | null>(null)
const uploadError = ref<string | null>(null)
const uploadSuccess = ref<string | null>(null)

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

function findSession(id: string | null): Session | undefined {
  if (!id) return undefined
  return (
    sessions.value.find((x) => x.id === id) ??
    pendingForConfirm.value.find((x) => x.id === id)
  )
}

async function loadPendingForConfirm() {
  const pending = await listAllPending()
  const filtered: Session[] = []
  for (const s of pending) {
    const mySlots = await getMySlotsForDate(s.date)
    const sessionSlot = { start: s.startTime, end: s.endTime }
    if (slotOverlapsAny(sessionSlot, mySlots)) filtered.push(s)
  }
  pendingForConfirm.value = filtered
}

const myUpcomingSessions = computed(() => {
  const t = todayIso()
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

const selectedSessionLabel = computed(() => {
  const s = findSession(selectedSessionId.value)
  if (!s) return ''
  return `${formatDateFr(s.date)} · ${s.startTime}–${s.endTime} · ${s.bookerEmail ?? s.bookerId}`
})

async function loadSessions() {
  await listForCurrentInge()
  await loadPendingForConfirm()
}

onMounted(loadSessions)

watch(selectedSessionId, async (id) => {
  uploadError.value = null
  uploadSuccess.value = null
  if (id) await listForSession(id)
})

async function handleSelectSession(sessionId: string) {
  selectedSessionId.value = sessionId
}

function rowMuted(index: number) {
  return index >= 2
}

function rowTextClass(muted: boolean) {
  return muted ? 'text-[#4C4C4C]' : 'text-white'
}

const handleFilesChange = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !selectedSessionId.value) return
  uploadError.value = null
  uploadSuccess.value = null
  try {
    const created = await uploadForSession(selectedSessionId.value, file)
    const session = findSession(selectedSessionId.value)
    const toEmail = session?.bookerEmail ?? null
    if (created && toEmail && session) {
      try {
        await $fetch('/api/send-session-file', {
          method: 'POST',
          body: {
            toEmail,
            session: {
              date: session.date,
              startTime: session.startTime,
              endTime: session.endTime,
            },
            file: {
              fileName: created.fileName,
              url: created.url,
            },
          },
        })
      } catch (err) {
        console.error('Send session file email', err)
      }
    }
    uploadSuccess.value = 'Fichier uploadé avec succès.'
  } catch (err: any) {
    uploadError.value = err?.message ?? 'Erreur lors de l’upload.'
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <div
    class="dashboard-sessions relative min-h-[50vh] w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-8 md:px-[120px]"
  >
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#0073FF]/20 via-transparent to-transparent blur-3xl"
      aria-hidden="true"
    />

    <h1
      class="relative z-[1] mb-10 font-['Raleway',sans-serif] text-[22px] font-medium leading-tight text-white sm:text-[28px]"
    >
      Pistes des sessions
    </h1>

    <div v-if="loading" class="relative z-[1] font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/70">
      Chargement…
    </div>

    <div v-else class="relative z-[1] flex flex-col gap-12">
      <!-- Choix session -->
      <section class="flex flex-col gap-6">
        <p
          class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[13px] font-normal uppercase tracking-[0.12em] text-white/45 sm:text-[14px]"
        >
          Choisir une session
        </p>

        <template v-if="myUpcomingSessions.length === 0">
          <p class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/60">
            Aucune session à venir (assignées ou en attente sur tes créneaux). Les sessions en attente
            apparaissent ici comme sur l’onglet Sessions.
          </p>
        </template>

        <div v-else class="flex flex-col gap-6 pb-2">
          <div v-for="(s, index) in myUpcomingSessions" :key="s.id" class="max-w-[1200px]">
            <button
              type="button"
              class="pds-sessions-ui w-full text-left transition-colors"
              :class="
                selectedSessionId === s.id
                  ? 'rounded-lg border border-[#0073FF]/45 bg-[#0073FF]/10 px-3 py-3 sm:px-4 sm:py-4'
                  : 'rounded-lg border border-transparent px-3 py-3 hover:border-white/15 hover:bg-white/[0.04] sm:px-4 sm:py-4'
              "
              @click="handleSelectSession(s.id)"
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
                        : 'bg-[#48FF37] shadow-[0_0_4px_#48FF37]'
                    "
                    aria-hidden="true"
                  />
                  <div
                    class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-5"
                  >
                    <p
                      class="session-name flex min-w-0 flex-wrap items-baseline gap-2 truncate text-2xl leading-tight sm:text-[26px]"
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
                  class="flex shrink-0 items-center justify-end gap-3 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[12px] sm:text-[13px]"
                  :class="rowTextClass(rowMuted(index))"
                >
                  <span
                    v-if="s.bookerEmail"
                    class="inline-flex max-w-[220px] items-center gap-2 truncate sm:max-w-[280px]"
                  >
                    <svg
                      class="h-[14px] w-[14px] shrink-0 opacity-80"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
                      />
                    </svg>
                    <span class="truncate">{{ s.bookerEmail }}</span>
                  </span>
                  <span
                    v-if="selectedSessionId === s.id"
                    class="inline-flex shrink-0 rounded-full bg-gradient-to-r from-[#0073FF] to-[#64E8FF] px-3 py-1 font-['Raleway',sans-serif] text-[11px] font-semibold uppercase tracking-wide text-[#0a1628]"
                  >
                    Sélectionnée
                  </span>
                </div>
              </div>
            </button>

            <div
              class="mt-6 h-px w-full max-w-[1200px] bg-[#A5A5A5]"
              role="presentation"
            />
          </div>
        </div>
      </section>

      <!-- Fichiers -->
      <section
        v-if="selectedSessionId"
        class="max-w-[1200px] rounded-lg border border-white/15 bg-white/5 px-4 py-5 sm:px-6 sm:py-6"
      >
        <h2
          class="mb-1 font-['Raleway',sans-serif] text-[17px] font-medium text-white sm:text-[18px]"
        >
          Fichiers de la session
        </h2>
        <p class="mb-6 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[13px] text-white/65 sm:text-[14px]">
          {{ selectedSessionLabel }}
        </p>

        <div class="mb-6">
          <label
            class="mb-2 block font-['Raleway',sans-serif] text-[12px] font-medium uppercase tracking-wide text-white/55"
            >Envoyer une piste</label
          >
          <input
            type="file"
            class="pds-sessions-ui w-full cursor-pointer text-sm text-white/90 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-gradient-to-r file:from-[#0073FF] file:to-[#64E8FF] file:px-4 file:py-2 file:font-['Raleway',sans-serif] file:text-[13px] file:font-semibold file:text-[#0a1628] hover:file:opacity-90"
            @change="handleFilesChange"
          />
        </div>

        <p v-if="uploadError || filesError" class="mb-3 text-sm text-red-400">
          {{ uploadError || filesError }}
        </p>
        <p v-if="uploadSuccess" class="mb-3 text-sm text-emerald-400">
          {{ uploadSuccess }}
        </p>

        <div class="border-t border-white/10 pt-5">
          <h3 class="mb-3 font-['Raleway',sans-serif] text-[13px] font-medium text-white/80">
            Fichiers envoyés
          </h3>
          <span
            v-if="filesLoading"
            class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[14px] text-white/55"
            >Chargement…</span
          >
          <p
            v-else-if="sessionFiles.length === 0"
            class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[14px] text-white/55"
          >
            Aucun fichier pour cette session.
          </p>
          <ul v-else class="space-y-2">
            <li
              v-for="f in sessionFiles"
              :key="f.id"
              class="flex flex-col gap-2 rounded-lg border border-white/12 bg-black/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="min-w-0">
                <p class="truncate font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] font-medium text-white">
                  {{ f.fileName }}
                </p>
                <a
                  :href="f.url"
                  target="_blank"
                  rel="noreferrer"
                  class="mt-1 inline-block text-sm text-[#64E8FF] underline-offset-2 hover:underline"
                >
                  Télécharger / ouvrir
                </a>
              </div>
              <span
                class="shrink-0 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[12px] text-white/45"
                >{{ f.createdAt.toLocaleDateString('fr-FR') }}</span
              >
            </li>
          </ul>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.session-name {
  font-family: Raleway, system-ui, sans-serif;
  font-weight: 700;
}
</style>
