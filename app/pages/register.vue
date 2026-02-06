<script setup lang="ts">
import { ref } from 'vue'
import { useAuth, type UserRole } from '../../composables/useAuth'
import { useRouter } from 'vue-router'
const router = useRouter()
const { signup, currentUser, loading } = useAuth()

const email = ref('')
const password = ref('')
const role = ref<UserRole>('booker')
const error = ref<string | null>(null)
const submitting = ref(false)

const onSubmit = async () => {
  error.value = null
  submitting.value = true
  try {
    await signup(email.value, password.value, role.value)
    if (role.value) {
      await router.push(`/dashboard/${role.value}`)
    } else {
      await router.push('/dashboard')
    }
  } catch (e: any) {
    error.value = e?.message ?? 'Erreur lors de la création du compte'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="pds-container">
    <h2 class="pds-h2 mb-8 text-center">
      Inscription
    </h2>
    <p class="pds-subtitle mb-8 text-center">
      Crée ton compte booker, ingé son ou beatmaker.
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
            minlength="6"
            required
            class="pds-input"
          >
        </div>
        <div class="form-group">
          <label class="pds-label">Rôle</label>
          <select v-model="role" class="pds-select">
            <option value="booker">Booker</option>
            <option value="inge">Ingé son</option>
            <option value="beatmaker">Beatmaker</option>
          </select>
        </div>
        <p v-if="error" class="text-sm text-red-400">
          {{ error }}
        </p>
        <button
          type="submit"
          class="btn-primary w-full"
          :disabled="submitting"
        >
          Créer un compte
        </button>
      </form>
    </div>

    <p class="text-center text-sm text-[var(--pds-muted)]">
      Tu as déjà un compte ?
      <NuxtLink to="/login" class="text-[var(--pds-primary)] hover:underline">
        Se connecter
      </NuxtLink>
    </p>
  </section>
</template>
