<script setup lang="ts">
import { ref } from 'vue'
import { useAuth } from '../../../composables/useAuth'
import { useRouter } from 'vue-router'

definePageMeta({
  middleware: 'register-inge-code-redirect',
})

const router = useRouter()
const { signup, loading } = useAuth()

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

const onSubmit = async () => {
  error.value = null
  submitting.value = true
  try {
    await signup(email.value, password.value, 'booker')
    await router.push('/dashboard/booker')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Erreur lors de la création du compte'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="auth-page relative flex min-h-[calc(100dvh-5.5rem)] w-full flex-col bg-black">
    <div class="auth-page-glow pointer-events-none absolute inset-x-0 bottom-0 z-0" aria-hidden="true" />

    <div
      class="relative z-10 flex w-full flex-1 flex-col items-center justify-center px-6 py-12 sm:px-10 sm:py-16"
    >
      <div class="w-full min-w-0 max-w-md">
        <h1
          class="mb-4 text-center text-3xl font-bold uppercase tracking-[0.14em] text-white sm:text-4xl"
        >
          INSCRIPTION
        </h1>
        <p class="mb-10 text-center text-sm text-white/50">
          Crée ton compte booker pour réserver une session au studio PDS.
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
            minlength="6"
            required
            autocomplete="new-password"
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
            {{ submitting ? 'Création…' : 'Créer un compte' }}
          </button>
        </form>

        <p class="mt-8 text-center text-sm text-[#888]">
          Tu as déjà un compte ?
          <NuxtLink
            to="/login"
            class="ml-1 font-medium text-white/90 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            Se connecter
          </NuxtLink>
        </p>
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
