<script setup lang="ts">
import { definePageMeta } from '#imports'
import { onMounted, ref } from 'vue'
import { useUsers } from '../../../composables/useUsers'

definePageMeta({
  middleware: 'require-auth',
  role: 'admin',
})

const { listByRole, deleteUser } = useUsers()

const ingeList = ref<any[]>([])
const beatmakerList = ref<any[]>([])
const loading = ref(true)
const deletingUid = ref<string | null>(null)
const adminError = ref<string | null>(null)

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
    <div v-else class="grid gap-4 sm:grid-cols-2">
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
  </AdminScreen>
</template>
