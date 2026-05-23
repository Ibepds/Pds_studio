<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useSessions, type Session } from '../../composables/useSessions'
import { useSessionFiles, type SessionFile } from '../../composables/useSessionFiles'
import { useAuth } from '../../composables/useAuth'

definePageMeta({
  middleware: 'require-auth',
  authRoles: ['reviewer', 'admin'],
})

const { currentUser, logout } = useAuth()
const { listPastSessions, saveSessionReview, markSessionReviewSent, loading, error } =
  useSessions()
const { fetchForSession, fetchAllGroupedBySession } = useSessionFiles()

function sessionEndAt(s: Session): Date {
  return new Date(`${s.date}T${s.endTime}`)
}

/** Fichiers déposés par l’ingé après la fin de la session */
function postSessionFiles(s: Session, files: SessionFile[]): SessionFile[] {
  const endMs = sessionEndAt(s).getTime()
  if (Number.isNaN(endMs)) return files
  return files.filter((f) => f.createdAt.getTime() >= endMs)
}

function sessionHasIngeFilesAfterSession(s: Session, files: SessionFile[]): boolean {
  return postSessionFiles(s, files).length > 0
}

const sessions = ref<Session[]>([])
const expandedId = ref<string | null>(null)
const filesBySession = ref<{ [sessionId: string]: Awaited<ReturnType<typeof fetchForSession>> }>(
  {},
)
const loadingFiles = ref<string | null>(null)

const drafts = ref<{ [sessionId: string]: { rating: number; notes: string } }>({})
const savingId = ref<string | null>(null)
const sendingId = ref<string | null>(null)
const pageMessage = ref<string | null>(null)
const pageError = ref<string | null>(null)

function initDraft(s: Session) {
  if (!drafts.value[s.id]) {
    drafts.value[s.id] = {
      rating: s.reviewRating ?? 0,
      notes: s.reviewNotes ?? '',
    }
  }
}

const pastCount = computed(() => sessions.value.length)

async function loadSessions() {
  pageError.value = null
  const [candidates, allFiles] = await Promise.all([
    listPastSessions(),
    fetchAllGroupedBySession(),
  ])

  const next: Session[] = []
  const nextFiles: typeof filesBySession.value = {}

  for (const s of candidates) {
    const raw = allFiles.get(s.id) ?? []
    if (!sessionHasIngeFilesAfterSession(s, raw)) continue
    next.push(s)
    nextFiles[s.id] = postSessionFiles(s, raw)
    initDraft(s)
  }

  sessions.value = next
  filesBySession.value = nextFiles
}

onMounted(loadSessions)

async function toggleSession(s: Session) {
  if (expandedId.value === s.id) {
    expandedId.value = null
    return
  }
  expandedId.value = s.id
  initDraft(s)
  if (!filesBySession.value[s.id]) {
    loadingFiles.value = s.id
    try {
      const raw = await fetchForSession(s.id)
      filesBySession.value[s.id] = postSessionFiles(s, raw)
    } finally {
      loadingFiles.value = null
    }
  }
}

function setRating(sessionId: string, rating: number) {
  initDraft(sessions.value.find((x) => x.id === sessionId)!)
  drafts.value[sessionId]!.rating = rating
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function statusLabel(status: Session['status']) {
  const labels: { [key: string]: string } = {
    pending: 'En attente',
    confirmed: 'Confirmée',
    done: 'Terminée',
    cancelled: 'Annulée',
    waiting_payment: 'Attente paiement',
  }
  return labels[status] ?? status
}

async function saveDraft(s: Session) {
  const d = drafts.value[s.id]
  if (!d?.rating || d.rating < 1) {
    pageError.value = 'Choisis une note entre 1 et 5 étoiles.'
    return
  }
  savingId.value = s.id
  pageError.value = null
  pageMessage.value = null
  try {
    await saveSessionReview(s.id, d.rating, d.notes)
    const idx = sessions.value.findIndex((x) => x.id === s.id)
    if (idx >= 0) {
      sessions.value[idx] = {
        ...sessions.value[idx]!,
        reviewRating: d.rating,
        reviewNotes: d.notes,
        reviewedBy: currentUser.value?.uid ?? null,
      }
    }
    pageMessage.value = 'Brouillon enregistré.'
  } catch (e: unknown) {
    pageError.value = e instanceof Error ? e.message : 'Erreur lors de l’enregistrement.'
  } finally {
    savingId.value = null
  }
}

async function sendReview(s: Session) {
  const d = drafts.value[s.id]
  if (!d?.rating || d.rating < 1) {
    pageError.value = 'Une note sur 5 est requise avant l’envoi.'
    return
  }
  if (!s.bookerEmail?.trim()) {
    pageError.value = 'Cette session n’a pas d’email booker — envoi impossible.'
    return
  }
  if (s.reviewSentAt) {
    pageError.value = 'L’avis a déjà été envoyé pour cette session.'
    return
  }

  sendingId.value = s.id
  pageError.value = null
  pageMessage.value = null

  try {
    await saveSessionReview(s.id, d.rating, d.notes)

    let files = filesBySession.value[s.id]
    if (!files?.length) {
      const raw = await fetchForSession(s.id)
      files = postSessionFiles(s, raw)
      filesBySession.value[s.id] = files
    }

    await $fetch('/api/send-session-review', {
      method: 'POST',
      body: {
        toEmail: s.bookerEmail,
        session: {
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          reservationName: s.reservationName,
        },
        review: {
          rating: d.rating,
          notes: d.notes,
        },
        files: files.map((f) => ({ fileName: f.fileName, url: f.url })),
      },
    })

    await markSessionReviewSent(s.id)
    const idx = sessions.value.findIndex((x) => x.id === s.id)
    if (idx >= 0) {
      sessions.value[idx] = {
        ...sessions.value[idx]!,
        reviewRating: d.rating,
        reviewNotes: d.notes,
        reviewSentAt: new Date(),
      }
    }
    pageMessage.value = `Avis envoyé à ${s.bookerEmail}.`
  } catch (e: unknown) {
    pageError.value = e instanceof Error ? e.message : 'Erreur lors de l’envoi.'
  } finally {
    sendingId.value = null
  }
}

async function handleLogout() {
  await logout()
  await navigateTo('/')
}

watch(expandedId, () => {
  pageMessage.value = null
  pageError.value = null
})
</script>

<template>
  <section class="min-h-[calc(100dvh-5rem)] bg-black text-white">
    <header class="border-b border-white/10">
      <div
        class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6"
      >
        <div>
          <h1 class="font-[Raleway,sans-serif] text-xl font-bold uppercase tracking-wide sm:text-2xl">
            Avis sessions
          </h1>
          <p class="mt-1 text-sm text-white/55">
            Sessions confirmées, terminées — avec pistes ingé déposées
          </p>
        </div>
        <div class="flex items-center gap-4">
          <span class="max-w-[200px] truncate text-xs text-white/60 sm:max-w-none sm:text-sm">{{
            currentUser?.email
          }}</span>
          <button
            type="button"
            class="text-sm text-white/80 transition hover:text-white"
            @click="handleLogout"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <p v-if="loading && !sessions.length" class="text-white/60">Chargement…</p>
      <p v-else-if="error" class="text-red-400">{{ error }}</p>
      <p v-else-if="!pastCount" class="text-white/60">
        Aucune session confirmée passée avec fichiers ingé pour le moment.
      </p>

      <p v-if="pageMessage" class="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
        {{ pageMessage }}
      </p>
      <p v-if="pageError" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
        {{ pageError }}
      </p>

      <ul class="space-y-4">
        <li
          v-for="s in sessions"
          :key="s.id"
          class="overflow-hidden rounded-2xl border border-white/10 bg-[#111]"
        >
          <button
            type="button"
            class="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/[0.03]"
            @click="toggleSession(s)"
          >
            <div>
              <p class="font-[Raleway,sans-serif] text-lg font-semibold text-white">
                {{ s.reservationName || 'Session' }}
              </p>
              <p class="mt-1 text-sm text-white/55">
                {{ formatDate(s.date) }} · {{ s.startTime }}–{{ s.endTime }}
                <span class="mx-2">·</span>
                {{ s.bookerEmail || 'Sans email' }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span
                v-if="s.reviewSentAt"
                class="rounded-full bg-emerald-500/15 px-3 py-0.5 text-xs text-emerald-300"
              >
                Avis envoyé
              </span>
              <span
                v-else-if="s.reviewRating"
                class="rounded-full bg-[#4a9eff]/15 px-3 py-0.5 text-xs text-[#7ec4ff]"
              >
                Brouillon · {{ s.reviewRating }}/5
              </span>
              <span class="rounded-full bg-white/10 px-3 py-0.5 text-xs text-white/70">
                {{ statusLabel(s.status) }}
              </span>
              <span class="text-white/40">{{ expandedId === s.id ? '▲' : '▼' }}</span>
            </div>
          </button>

          <div v-if="expandedId === s.id" class="border-t border-white/10 px-5 py-6 space-y-6">
            <section>
              <h3 class="mb-3 text-sm font-medium uppercase tracking-wider text-white/50">
                Pistes ingé son
              </h3>
              <p v-if="loadingFiles === s.id" class="text-sm text-white/50">Chargement des fichiers…</p>
              <p
                v-else-if="!filesBySession[s.id]?.length"
                class="text-sm text-white/50"
              >
                Aucun fichier déposé pour cette session.
              </p>
              <ul v-else class="space-y-4">
                <li
                  v-for="f in filesBySession[s.id]"
                  :key="f.id"
                  class="rounded-xl border border-white/10 bg-black/40 p-4"
                >
                  <p class="mb-2 text-sm font-medium text-white">{{ f.fileName }}</p>
                  <audio
                    v-if="f.url"
                    controls
                    preload="metadata"
                    class="mb-3 w-full max-w-full"
                    :src="f.url"
                  />
                  <a
                    :href="f.url"
                    target="_blank"
                    rel="noreferrer"
                    download
                    class="text-sm text-[#4a9eff] hover:underline"
                  >
                    Télécharger
                  </a>
                </li>
              </ul>
            </section>

            <section>
              <h3 class="mb-3 text-sm font-medium uppercase tracking-wider text-white/50">
                Votre avis
              </h3>

              <p class="mb-2 text-sm text-white/60">Note (sur 5)</p>
              <div class="star-rating mb-4 flex gap-1.5" role="group" aria-label="Note sur 5 étoiles">
                <button
                  v-for="star in 5"
                  :key="star"
                  type="button"
                  class="star-rating__btn"
                  :class="{ 'star-rating__btn--active': (drafts[s.id]?.rating ?? 0) >= star }"
                  :aria-label="`${star} étoile${star > 1 ? 's' : ''}`"
                  :disabled="!!s.reviewSentAt"
                  @click="setRating(s.id, star)"
                >
                  <span class="star-rating__glyph" aria-hidden="true">★</span>
                </button>
              </div>

              <label class="mb-2 block text-sm text-white/60">
                Ce qui a été produit (commentaire)
              </label>
              <textarea
                v-model="drafts[s.id]!.notes"
                rows="5"
                class="w-full rounded-xl border border-white/20 bg-black/50 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
                placeholder="Résumé de la session, qualité des prises, pistes livrées…"
                :disabled="!!s.reviewSentAt"
              />

              <div v-if="s.reviewSentAt" class="mt-4 text-sm text-emerald-300/90">
                Avis envoyé le
                {{
                  s.reviewSentAt.toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                }}
              </div>

              <div v-else class="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  class="rounded-full border border-white/30 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-40"
                  :disabled="savingId === s.id || sendingId === s.id"
                  @click="saveDraft(s)"
                >
                  {{ savingId === s.id ? 'Enregistrement…' : 'Enregistrer brouillon' }}
                </button>
                <button
                  type="button"
                  class="rounded-full border border-[#4a9eff] bg-[#4a9eff]/20 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[#4a9eff]/30 disabled:opacity-40"
                  :disabled="sendingId === s.id || !s.bookerEmail"
                  @click="sendReview(s)"
                >
                  {{ sendingId === s.id ? 'Envoi…' : 'Envoyer l’avis au booker' }}
                </button>
              </div>
            </section>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.star-rating__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  border: none;
  background: transparent;
  background-image: none;
  cursor: pointer;
  transition: transform 0.15s ease;
  outline: none;
  box-shadow: none;
  -webkit-tap-highlight-color: transparent;
}

.star-rating__btn:hover,
.star-rating__btn:focus,
.star-rating__btn:focus-visible,
.star-rating__btn:active {
  background: transparent !important;
  background-image: none !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}

.star-rating__btn:hover:not(:disabled) {
  transform: scale(1.08);
}

.star-rating__btn:disabled {
  cursor: default;
}

.star-rating__glyph {
  font-size: 2rem;
  line-height: 1;
  color: rgba(255, 255, 255, 0.22);
  transition: color 0.15s ease, text-shadow 0.15s ease;
}

.star-rating__btn:hover:not(:disabled) .star-rating__glyph {
  color: rgba(74, 158, 255, 0.55);
}

.star-rating__btn--active .star-rating__glyph {
  color: #4a9eff;
  text-shadow:
    0 0 6px rgba(59, 130, 246, 0.95),
    0 0 14px rgba(59, 130, 246, 0.45);
}
</style>
