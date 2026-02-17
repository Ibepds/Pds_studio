<script setup lang="ts">
import { definePageMeta, navigateTo } from '#imports'
import { useRoute } from 'vue-router'
import { useAuth } from '../../../composables/useAuth'

definePageMeta({
  middleware: 'require-auth',
  role: 'beatmaker',
})

const route = useRoute()
const { currentUser, logout } = useAuth()

const handleLogout = async () => {
  await logout()
  await navigateTo('/')
}

const navLinks = [
  { to: '/dashboard/beatmaker/prods', label: 'Mes prods' },
  { to: '/dashboard/beatmaker/calendrier', label: 'Calendrier' },
  { to: '/dashboard/beatmaker/disponibilites', label: 'Disponibilités' },
  { to: '/dashboard/beatmaker/sessions', label: 'Sessions' },
]

function isActive(to: string) {
  return route.path === to
}
</script>

<template>
  <section class="space-y-6">
    <header class="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--pds-border)] pb-4">
      <div>
        <h1 class="pds-h2 text-xl">
          Tableau de bord – Beatmaker
        </h1>
        <p class="pds-subtitle mt-1">
          {{ currentUser?.email }}
        </p>
      </div>
      <button type="button" class="btn-secondary" @click="handleLogout">
        Déconnexion
      </button>
    </header>

    <nav class="flex flex-wrap gap-2 border-b border-[var(--pds-border)] pb-4">
      <NuxtLink
        v-for="link in navLinks"
        :key="link.to"
        :to="link.to"
        class="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        :class="isActive(link.to) ? 'bg-[var(--pds-primary)]/20 text-[var(--pds-primary)]' : 'text-[var(--pds-muted)] hover:text-[var(--pds-text)] hover:bg-[var(--pds-border)]/50'"
      >
        {{ link.label }}
      </NuxtLink>
    </nav>

    <NuxtPage />
  </section>
</template>
