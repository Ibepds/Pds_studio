<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useAuth, type UserRole } from '../../../composables/useAuth'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { currentUser, logout, loading: authLoading } = useAuth()

const roleParam = computed<UserRole | null>(() => {
  const r = route.params.role as string
  if (r === 'booker' || r === 'inge' || r === 'beatmaker') return r
  return null
})

watchEffect(() => {
  if (!authLoading.value && currentUser.value && roleParam.value && currentUser.value.role !== roleParam.value) {
    router.replace(`/dashboard/${currentUser.value.role}`)
  }
})

const handleLogout = async () => {
  await logout()
  await router.push('/')
}
</script>

<template>
  <section v-if="!authLoading" class="space-y-6">
    <header class="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--pds-border)] pb-4">
      <div>
        <h1 class="pds-h2 text-xl">
          Tableau de bord
        </h1>
        <p class="pds-subtitle mt-1">
          <span class="font-medium text-[var(--pds-text)]">{{ currentUser?.role }}</span>
          – {{ currentUser?.email }}
        </p>
      </div>
      <button
        type="button"
        class="btn-secondary"
        @click="handleLogout"
      >
        Déconnexion
      </button>
    </header>

    <Booker v-if="roleParam === 'booker'" />
    <Inge v-else-if="roleParam === 'inge'" />
    <Beatmaker v-else-if="roleParam === 'beatmaker'" />

    <div v-else class="text-sm text-red-400">
      Rôle inconnu.
    </div>
  </section>
</template>
