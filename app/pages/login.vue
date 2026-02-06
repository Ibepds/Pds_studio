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
  <section class="pds-container">
    <h2 class="pds-h2 mb-8 text-center">
      Connexion
    </h2>
    <p class="pds-subtitle mb-8 text-center">
      Identifie-toi pour accéder à ton espace
      <span v-if="roleFromQuery"> ({{ roleFromQuery }})</span>.
    </p>

    <div class="pds-card mb-6">
      <form class="space-y-5" @submit.prevent="onSubmit">
        <div class="form-group">
          <label class="pds-label">Email</label>
          <input
            v-model="email"
            type="email"
            required
            class="pds-input"
          >
        </div>
        <div class="form-group">
          <label class="pds-label">Mot de passe</label>
          <input
            v-model="password"
            type="password"
            required
            class="pds-input"
          >
        </div>
        <p v-if="error" class="text-sm text-red-400">
          {{ error }}
        </p>
        <button
          type="submit"
          class="btn-primary w-full"
          :disabled="submitting"
        >
          Connexion
        </button>
      </form>
    </div>

    <p class="text-center text-sm text-[var(--pds-muted)]">
      Pas encore de compte ?
      <NuxtLink to="/register" class="text-[var(--pds-primary)] hover:underline">
        Créer un compte
      </NuxtLink>
    </p>
  </section>
</template>
