<script setup lang="ts">
import { definePageMeta } from '#imports'
import { useRoute } from 'vue-router'

definePageMeta({
  middleware: 'require-auth',
  role: 'booker',
})

const route = useRoute()

const navLinks = [
  { to: '/dashboard/booker/reserver', label: 'Réserver une session' },
  { to: '/dashboard/booker/mes-sessions', label: 'Mes réservations' },
]

function isActive(to: string) {
  return route.path === to
}
</script>

<template>
  <section class="booker-dashboard font-[Raleway,sans-serif] text-white">
    <div class="mx-auto w-full max-w-[1440px] px-6 pb-10 pt-4 sm:px-[120px] sm:pb-12 sm:pt-6">
      <nav class="flex flex-wrap gap-2 border-b border-white/10 pb-5 sm:gap-3">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="rounded-full border px-4 py-2 text-sm font-medium transition-colors sm:px-5"
          :class="
            isActive(link.to)
              ? 'border-[var(--pds-primary)] bg-[var(--pds-primary)]/20 text-white'
              : 'border-white/20 text-white/70 hover:border-white/40 hover:text-white'
          "
        >
          {{ link.label }}
        </NuxtLink>
      </nav>

      <div class="pt-6 sm:pt-8">
        <NuxtPage />
      </div>
    </div>
  </section>
</template>
