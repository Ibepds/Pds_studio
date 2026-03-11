<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuth } from '../composables/useAuth'

const { currentUser, logout } = useAuth()
const navOpen = ref(false)

const userLabel = computed(() => {
  const u = currentUser.value
  if (!u) return null
  const roleLabels: Record<string, string> = {
    booker: 'Booker',
    inge: 'Ingé son',
    beatmaker: 'Beatmaker',
    admin: 'Admin',
  }
  const role = roleLabels[u.role] ?? u.role
  return u.email ? `${u.email} (${role})` : role
})

function closeNav() {
  navOpen.value = false
}

async function handleLogout() {
  closeNav()
  await logout()
  const router = useRouter()
  await router.push('/')
}
</script>

<template>
  <div class="min-h-screen bg-[var(--pds-bg)] text-[var(--pds-text)] flex flex-col">
    <!-- Navbar -->
    <header
      class="sticky top-0 z-50 border-b border-[var(--pds-border)] bg-[var(--pds-card)]/95 backdrop-blur-sm"
    >
      <nav
        class="mx-auto flex max-w-4xl w-full items-center justify-between gap-4 px-4 py-3 sm:px-6"
      >
        <NuxtLink
          to="/"
          class="text-xl font-light tracking-[0.2em] text-white shrink-0"
          @click="closeNav"
        >
          PDS
        </NuxtLink>

        <!-- Desktop: liens à droite -->
        <div class="hidden md:flex items-center gap-2">
          <NuxtLink to="/" class="nav-link">Accueil</NuxtLink>
          <NuxtLink v-if="currentUser?.role === 'admin'" to="/admin" class="nav-link">
            Admin
          </NuxtLink>
          <NuxtLink
            v-if="
              currentUser &&
              (currentUser.role === 'booker' ||
                currentUser.role === 'inge' ||
                currentUser.role === 'beatmaker')
            "
            :to="`/dashboard/${currentUser.role}`"
            class="nav-link"
          >
            Tableau de bord
          </NuxtLink>
          <template v-if="currentUser">
            <span class="nav-user" :title="userLabel ?? ''">{{ userLabel }}</span>
            <button type="button" class="btn-secondary !py-2 !px-4 !text-sm" @click="handleLogout">
              Déconnexion
            </button>
          </template>
          <template v-else>
            <NuxtLink to="/login" class="btn-secondary !py-2 !px-4 !text-sm">Se connecter</NuxtLink>
            <NuxtLink to="/register" class="btn-primary !py-2 !px-4 !text-sm">Inscription</NuxtLink>
          </template>
        </div>

        <!-- Mobile: bouton hamburger -->
        <button
          type="button"
          class="md:hidden p-2 rounded-lg border border-[var(--pds-border)] text-[var(--pds-text)] hover:border-[var(--pds-primary)]"
          aria-label="Menu"
          @click="navOpen = !navOpen"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              v-if="!navOpen"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
            <path
              v-else
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </nav>

      <!-- Mobile: menu déroulant -->
      <Transition
        enter-active-class="transition ease-out duration-200"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition ease-in duration-150"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div
          v-show="navOpen"
          class="md:hidden border-t border-[var(--pds-border)] bg-[var(--pds-card)] px-4 py-3 flex flex-col gap-2"
        >
          <NuxtLink to="/" class="nav-link-mobile" @click="closeNav">Accueil</NuxtLink>
          <NuxtLink
            v-if="currentUser?.role === 'admin'"
            to="/admin"
            class="nav-link-mobile"
            @click="closeNav"
          >
            Admin
          </NuxtLink>
          <NuxtLink
            v-if="
              currentUser &&
              (currentUser.role === 'booker' ||
                currentUser.role === 'inge' ||
                currentUser.role === 'beatmaker')
            "
            :to="`/dashboard/${currentUser.role}`"
            class="nav-link-mobile"
            @click="closeNav"
          >
            Tableau de bord
          </NuxtLink>
          <template v-if="currentUser">
            <span class="text-sm text-[var(--pds-muted)] truncate px-3 py-2">{{ userLabel }}</span>
            <button type="button" class="nav-link-mobile text-left" @click="handleLogout">
              Déconnexion
            </button>
          </template>
          <template v-else>
            <NuxtLink to="/login" class="nav-link-mobile" @click="closeNav">Se connecter</NuxtLink>
            <NuxtLink
              to="/register"
              class="nav-link-mobile btn-primary !text-center"
              @click="closeNav"
              >Inscription</NuxtLink
            >
          </template>
        </div>
      </Transition>
    </header>

    <main class="mx-auto max-w-4xl w-full flex-1 px-4 py-6 sm:py-8 sm:px-6">
      <NuxtPage />
    </main>

    <!-- Footer -->
    <footer class="border-t border-[var(--pds-border)] bg-[var(--pds-card)]/60 mt-auto">
      <div class="mx-auto max-w-4xl w-full px-4 py-8 sm:px-6">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p class="text-lg font-light tracking-[0.15em] text-white">PDS Studio</p>
            <p class="text-sm text-[var(--pds-muted)] mt-1">
              Réservation de studio • Ingé son & beatmakers
            </p>
          </div>
          <div class="footer-contact">
            <p class="text-xs uppercase tracking-wider text-[var(--pds-muted)] mb-2">
              Nous contacter
            </p>
            <a href="mailto:contact@pds-studio.com" class="footer-link">contact@pds-studio.com</a>
            <a href="tel:+33000000000" class="footer-link block mt-1">+33 (0)0 00 00 00 00</a>
            <p class="text-sm text-[var(--pds-muted2)] mt-2">Adresse du studio • Ville</p>
          </div>
        </div>
        <p
          class="text-center sm:text-right text-xs text-[var(--pds-muted2)] mt-6 pt-4 border-t border-[var(--pds-border)]"
        >
          © {{ new Date().getFullYear() }} PDS Studio. Tous droits réservés.
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.nav-link {
  @apply px-3 py-2 text-sm text-[var(--pds-muted)] hover:text-[var(--pds-primary)] transition-colors rounded-lg;
}
.nav-user {
  max-width: 180px;
  @apply text-sm text-[var(--pds-muted)] truncate px-2;
}
.nav-link-mobile {
  @apply block py-2.5 px-3 text-[var(--pds-text)] hover:text-[var(--pds-primary)] rounded-lg;
}
.nav-link-mobile:hover {
  background-color: color-mix(in srgb, var(--pds-border) 50%, transparent);
}
.footer-link {
  @apply text-sm text-[var(--pds-primary)] hover:underline;
}
</style>
