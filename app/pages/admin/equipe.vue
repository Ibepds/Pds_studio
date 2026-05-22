<script setup lang="ts">
import { definePageMeta } from '#imports'
import { onMounted, ref } from 'vue'
import { useAuth } from '../../../composables/useAuth'
import { useIngeInvites } from '../../../composables/useIngeInvites'
import { useUsers } from '../../../composables/useUsers'

definePageMeta({
  middleware: 'require-auth',
  role: 'admin',
})

const { listByRole, deleteUser } = useUsers()
const { currentUser } = useAuth()
const { createInvite, loading: inviteLoading, error: inviteError } = useIngeInvites()

const ingeList = ref<any[]>([])
const beatmakerList = ref<any[]>([])
const loading = ref(true)
const deletingUid = ref<string | null>(null)
const adminError = ref<string | null>(null)

const lastInviteLink = ref<string | null>(null)
const lastInviteCode = ref<string | null>(null)
const inviteCopied = ref(false)

async function load() {
  loading.value = true
  adminError.value = null
  try {
    const [i, b] = await Promise.all([listByRole('inge'), listByRole('beatmaker')])
    ingeList.value = i
    beatmakerList.value = b
  } catch (e: any) {
    adminError.value = e?.message ?? 'Erreur de chargement'
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function handleAddInge() {
  const uid = currentUser.value?.uid
  if (!uid) {
    adminError.value = 'Session admin requise.'
    return
  }
  adminError.value = null
  inviteCopied.value = false
  try {
    const { code, link } = await createInvite(uid)
    lastInviteCode.value = code
    lastInviteLink.value = link
  } catch (e: unknown) {
    adminError.value =
      e instanceof Error ? e.message : inviteError.value ?? 'Erreur lors de la génération du lien'
  }
}

async function copyInviteLink() {
  if (!lastInviteLink.value) return
  try {
    await navigator.clipboard.writeText(lastInviteLink.value)
    inviteCopied.value = true
    setTimeout(() => {
      inviteCopied.value = false
    }, 2500)
  } catch {
    adminError.value = 'Impossible de copier le lien (autorise le presse-papiers).'
  }
}

async function handleDeleteUser(uid: string, role: string) {
  if (
    !confirm(
      `Supprimer ce compte ${role} ? Il perdra son rôle et sera considéré comme booker à la prochaine connexion.`,
    )
  ) {
    return
  }
  deletingUid.value = uid
  adminError.value = null
  try {
    await deleteUser(uid)
    await load()
  } catch (e: any) {
    adminError.value = e?.message ?? 'Erreur lors de la suppression'
  } finally {
    deletingUid.value = null
  }
}
</script>

<template>
  <AdminScreen
    title="Équipe"
    subtitle="Ingés son et beatmakers — suppression du rôle (repli booker à la prochaine connexion)."
  >
    <p v-if="adminError" class="mb-6 text-sm text-red-400">
      {{ adminError }}
    </p>

    <div v-if="loading" class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/55">
      Chargement…
    </div>
    <div v-else class="space-y-6">
      <div class="rounded-xl border border-[#4a9eff]/30 bg-[#4a9eff]/10 p-5 sm:p-6">
        <h3 class="mb-2 font-['Raleway',sans-serif] text-[17px] font-medium text-white">
          Inviter un nouvel ingé son
        </h3>
        <p class="mb-4 font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-sm text-white/60">
          Génère un lien d’inscription à usage unique. Une fois le compte créé, le code est supprimé
          et le lien ne fonctionne plus.
        </p>
        <button
          type="button"
          class="pds-sessions-ui rounded-full border border-[#4a9eff]/50 bg-[#4a9eff]/20 px-4 py-2 text-sm font-medium text-white transition hover:bg-[#4a9eff]/30 disabled:opacity-50"
          :disabled="inviteLoading"
          @click="handleAddInge"
        >
          {{ inviteLoading ? 'Génération…' : 'Ajouter un nouvel ingé son' }}
        </button>
        <div v-if="lastInviteLink" class="mt-4 space-y-2 rounded-lg border border-white/10 bg-black/40 p-4">
          <p class="text-xs text-white/50">Lien à transmettre (une seule utilisation) :</p>
          <p class="break-all font-mono text-xs text-[#64E8FF]">{{ lastInviteLink }}</p>
          <p v-if="lastInviteCode" class="text-xs text-white/40">
            Code : {{ lastInviteCode }}
          </p>
          <button
            type="button"
            class="pds-sessions-ui text-sm text-white/85 underline-offset-2 hover:text-white hover:underline"
            @click="copyInviteLink"
          >
            {{ inviteCopied ? 'Lien copié' : 'Copier le lien' }}
          </button>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-xl border border-white/15 bg-white/[0.04] p-5 sm:p-6">
        <h3 class="mb-4 font-['Raleway',sans-serif] text-[17px] font-medium text-white">
          Ingés son
        </h3>
        <ul class="space-y-3 text-sm">
          <li
            v-for="u in ingeList"
            :key="u.uid"
            class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 last:border-0 last:pb-0"
          >
            <span
              class="min-w-0 flex-1 truncate font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-white/85"
              :title="String(u.email ?? u.uid)"
              >{{ u.email ?? u.uid }}</span
            >
            <button
              type="button"
              class="pds-sessions-ui rounded-full border border-red-400/45 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
              :disabled="deletingUid === u.uid"
              @click="handleDeleteUser(u.uid, 'ingé son')"
            >
              {{ deletingUid === u.uid ? '…' : 'Supprimer' }}
            </button>
          </li>
          <li
            v-if="ingeList.length === 0"
            class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/45"
          >
            Aucun
          </li>
        </ul>
      </div>
      <div class="rounded-xl border border-white/15 bg-white/[0.04] p-5 sm:p-6">
        <h3 class="mb-4 font-['Raleway',sans-serif] text-[17px] font-medium text-white">
          Beatmakers
        </h3>
        <ul class="space-y-3 text-sm">
          <li
            v-for="u in beatmakerList"
            :key="u.uid"
            class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 last:border-0 last:pb-0"
          >
            <span
              class="min-w-0 flex-1 truncate font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-white/85"
              :title="String(u.email ?? u.uid)"
              >{{ u.email ?? u.uid }}</span
            >
            <button
              type="button"
              class="pds-sessions-ui rounded-full border border-red-400/45 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
              :disabled="deletingUid === u.uid"
              @click="handleDeleteUser(u.uid, 'beatmaker')"
            >
              {{ deletingUid === u.uid ? '…' : 'Supprimer' }}
            </button>
          </li>
          <li
            v-if="beatmakerList.length === 0"
            class="font-[Helvetica_Neue,Helvetica,Arial,sans-serif] text-[15px] text-white/45"
          >
            Aucun
          </li>
        </ul>
      </div>
      </div>
    </div>
  </AdminScreen>
</template>
