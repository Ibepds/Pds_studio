<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuth } from '../../composables/useAuth'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { login, currentUser, loading } = useAuth()

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

const onSubmit = async () => {
  error.value = null
  submitting.value = true
  try {
    await login(email.value, password.value)
    if (currentUser.value?.role) {
      await router.push(`/dashboard/${currentUser.value.role}`)
    } else {
      await router.push('/dashboard')
    }
  } catch (e: any) {
    error.value = e?.message ?? 'Erreur de connexion'
  } finally {
    submitting.value = false
  }
}

const roleFromQuery = computed(() => route.query.role as string | undefined)
</script>

<template>
  <!-- Plein écran sous la nav : noir 100% largeur / hauteur utile, halo uniquement en bas (zone footer) -->
  <section
    class="auth-page relative flex min-h-[calc(100dvh-5.5rem)] w-full flex-col overflow-hidden bg-black"
  >
    <div class="auth-page-glow pointer-events-none absolute inset-x-0 bottom-0 z-0" aria-hidden="true" />

    <div
      class="relative z-10 flex w-full flex-1 flex-col items-center justify-center px-6 py-12 sm:px-10 sm:py-16"
    >
      <div class="w-full max-w-md">
        <h1
          class="mb-10 text-center text-3xl font-bold uppercase tracking-[0.14em] text-white sm:text-4xl"
        >
          SE CONNECTER
        </h1>
        <p v-if="roleFromQuery" class="mb-6 text-center text-sm text-white/50">
          Espace {{ roleFromQuery }}
        </p>

        <form class="space-y-4" @submit.prevent="onSubmit">
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="auth-pill-input w-full"
            placeholder="Email"
          />
          <input
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="auth-pill-input w-full"
            placeholder="Mot de passe"
          />
          <p v-if="error" class="text-center text-sm text-red-400">
            {{ error }}
          </p>
          <button
            type="submit"
            class="auth-pill-submit w-full"
            :disabled="submitting || loading"
          >
            {{ submitting ? 'Connexion…' : 'Se connecter' }}
          </button>
        </form>

        <div class="mt-8 space-y-4 text-center">
          <p>
            <a href="#" class="text-sm text-[#888] transition-colors hover:text-white/80">
              Mot de passe oublié ?
            </a>
          </p>
          <p class="text-sm text-[#888]">
            Pas encore de compte ?
            <NuxtLink
              to="/register"
              class="ml-1 font-medium text-white/90 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              S’inscrire
            </NuxtLink>
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.auth-page-glow {
  height: min(40vh, 280px);
  background:
    radial-gradient(ellipse 120% 80% at 50% 100%, rgba(59, 130, 246, 0.45), transparent 55%),
    linear-gradient(to top, rgba(26, 77, 140, 0.5) 0%, transparent 65%);
}

.auth-pill-input {
  @apply rounded-full border border-[#3a3a3a] bg-transparent px-6 py-3.5 text-[15px] text-white placeholder:text-[#666] transition-colors;
}
.auth-pill-input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.35);
}
.auth-pill-submit {
  @apply mt-2 rounded-full border border-[#4a4a4a] bg-transparent px-6 py-3.5 text-[15px] font-medium tracking-wide text-white transition-colors;
}
.auth-pill-submit:disabled {
  @apply cursor-not-allowed opacity-50;
}
</style>
