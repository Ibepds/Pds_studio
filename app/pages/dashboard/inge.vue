<script setup lang="ts">
import { definePageMeta, navigateTo } from '#imports'
import { useRoute } from 'vue-router'
import { useAuth } from '../../../composables/useAuth'

definePageMeta({
  middleware: 'require-auth',
  role: 'inge',
})

const route = useRoute()
const { currentUser, logout } = useAuth()

const handleLogout = async () => {
  await logout()
  await navigateTo('/')
}

const navLinks = [
  { to: '/dashboard/inge/sessions', label: 'Sessions' },
  { to: '/dashboard/inge/disponibilites', label: 'Mes disponibilités' },
  { to: '/dashboard/inge/pistes', label: 'Pistes / Fichiers' },
]

function isActive(to: string) {
  return route.path === to
}
</script>

<template>
  <section class="min-w-0 overflow-x-clip bg-black text-white">
    <header class="border-b border-white/10">
      <div
        class="mx-auto flex w-full min-w-0 max-w-[1440px] flex-wrap items-center justify-end gap-x-6 gap-y-3 px-4 py-4 sm:gap-x-8 sm:px-8 md:gap-x-10 md:px-[120px] md:py-5"
      >
        <nav
          class="pds-dashboard-subnav flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-8 font-['Raleway',sans-serif] text-[15px] font-medium leading-tight sm:gap-x-10 sm:text-base"
          aria-label="Sections du tableau de bord"
        >
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="border-b-2 pb-1.5 transition-colors duration-200"
            :class="
              isActive(link.to)
                ? 'border-[#4a9eff] text-[#4a9eff]'
                : 'border-transparent text-white/[0.88] hover:text-white'
            "
          >
            {{ link.label }}
          </NuxtLink>
        </nav>

        <span
          class="hidden h-4 w-px bg-white/15 sm:block"
          aria-hidden="true"
        />

        <span
          class="min-w-0 max-w-[min(100%,200px)] truncate text-xs text-white/65 sm:max-w-[280px] sm:text-sm"
          :title="currentUser?.email ?? ''"
          >{{ currentUser?.email }}</span
        >
        <button
          type="button"
          class="pds-sessions-ui shrink-0 text-sm text-white/85 transition hover:text-white"
          @click="handleLogout"
        >
          Déconnexion
        </button>
      </div>
    </header>

    <NuxtPage />
  </section>
</template>
