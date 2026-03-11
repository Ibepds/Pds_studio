<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useSessions } from '../../composables/useSessions'
import { useSessionFiles } from '../../composables/useSessionFiles'
import { useAuth } from '../../composables/useAuth'

const { sessions, listAllUpcoming } = useSessions()
const {
  files: sessionFiles,
  loading: filesLoading,
  error: filesError,
  listForSession,
  uploadForSession,
} = useSessionFiles()
const { currentUser } = useAuth()

const selectedSessionId = ref<string | null>(null)
const uploadError = ref<string | null>(null)
const uploadSuccess = ref<string | null>(null)

const myUpcomingSessions = computed(() => {
  const uid = currentUser.value?.uid
  if (!uid) return []
  return sessions.value.filter((s) => s.ingeId === uid)
})

const selectedSessionLabel = computed(() => {
  const s = sessions.value.find((x) => x.id === selectedSessionId.value)
  if (!s) return ''
  return `${s.date} • ${s.startTime}-${s.endTime} • ${s.bookerEmail ?? s.bookerId}`
})

onMounted(listAllUpcoming)

watch(selectedSessionId, async (id) => {
  uploadError.value = null
  uploadSuccess.value = null
  if (id) await listForSession(id)
})

async function handleSelectSession(sessionId: string) {
  selectedSessionId.value = sessionId
}

const handleFilesChange = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !selectedSessionId.value) return
  uploadError.value = null
  uploadSuccess.value = null
  try {
    const created = await uploadForSession(selectedSessionId.value, file)
    const session = sessions.value.find((s) => s.id === selectedSessionId.value)
    const toEmail = session?.bookerEmail ?? null
    if (created && toEmail) {
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
  <div class="space-y-6">
    <h2 class="pds-h2">Pistes des sessions</h2>

    <div class="pds-card space-y-3">
      <h3 class="pds-subtitle">Choisir une session</h3>
      <div v-if="myUpcomingSessions.length === 0" class="text-sm text-[var(--pds-muted)]">
        Aucune session à venir. Confirme des sessions pour en voir la liste ici.
      </div>
      <div v-else class="space-y-2">
        <button
          v-for="s in myUpcomingSessions"
          :key="s.id"
          type="button"
          class="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors"
          :class="[
            selectedSessionId === s.id
              ? 'border-[var(--pds-primary)] bg-[var(--pds-primary)]/10'
              : 'border-[var(--pds-border)] bg-[var(--pds-bg)] hover:border-[var(--pds-primary)]',
          ]"
          @click="handleSelectSession(s.id)"
        >
          <span class="font-medium">{{ s.date }} • {{ s.startTime }} – {{ s.endTime }}</span>
          <span class="text-xs text-[var(--pds-muted)]">{{ s.bookerEmail ?? s.bookerId }}</span>
        </button>
      </div>
    </div>

    <div v-if="selectedSessionId" class="pds-card space-y-3">
      <h3 class="pds-subtitle">Fichiers de la session</h3>
      <p class="text-sm text-[var(--pds-muted)]">
        Session : <span class="font-medium text-[var(--pds-text)]">{{ selectedSessionLabel }}</span>
      </p>
      <div class="form-group">
        <label class="pds-label">Uploader une piste (stereo mix, stems, etc.)</label>
        <input
          type="file"
          class="w-full text-sm text-[var(--pds-text)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--pds-primary)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
          @change="handleFilesChange"
        />
      </div>
      <p v-if="uploadError || filesError" class="text-sm text-red-400">
        {{ uploadError || filesError }}
      </p>
      <p v-if="uploadSuccess" class="text-sm text-emerald-400">
        {{ uploadSuccess }}
      </p>
      <div class="space-y-2">
        <h4 class="pds-label mb-0">Fichiers uploadés</h4>
        <span v-if="filesLoading" class="text-xs text-[var(--pds-muted)]">Chargement...</span>
        <div v-else-if="sessionFiles.length === 0" class="text-sm text-[var(--pds-muted)]">
          Aucun fichier pour cette session.
        </div>
        <ul v-else class="space-y-1 text-sm">
          <li
            v-for="f in sessionFiles"
            :key="f.id"
            class="flex items-center justify-between rounded-lg border border-[var(--pds-border)] bg-[var(--pds-bg)] px-3 py-2"
          >
            <div>
              <p class="font-medium text-slate-100">{{ f.fileName }}</p>
              <a
                :href="f.url"
                target="_blank"
                rel="noreferrer"
                class="text-sm text-[var(--pds-primary)] hover:underline"
              >
                Télécharger / ouvrir
              </a>
            </div>
            <span class="text-xs text-[var(--pds-muted)]">{{
              f.createdAt.toLocaleDateString()
            }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
