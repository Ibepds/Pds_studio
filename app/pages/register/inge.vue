<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../../../composables/useAuth'
import { useIngeInvites } from '../../../composables/useIngeInvites'

const route = useRoute()
const router = useRouter()
const { signupAsIngeWithInvite, activateIngeRoleWithInvite, logout, currentUser, authReady, loading } =
  useAuth()
const { isInviteValid } = useIngeInvites()

const inviteCode = computed(() => {
  const q = route.query.code
  const raw = Array.isArray(q) ? q[0] : q
  return typeof raw === 'string' ? raw.trim() : ''
})

const accessAllowed = ref(false)
const checkingCode = ref(true)
const accessError = ref<string | null>(null)
const mode = ref<'signup' | 'activate'>('signup')

const email = ref('')
const password = ref('')
const formError = ref<string | null>(null)
const submitting = ref(false)

onMounted(async () => {
  if (currentUser.value) {
    await logout()
  }

  checkingCode.value = true
  accessError.value = null
  accessAllowed.value = false

  if (!inviteCode.value) {
    accessError.value =
      'Accès refusé. Cette page est réservée aux ingés son invités par l’administration (lien avec code requis).'
    checkingCode.value = false
    return
  }

  try {
    const ok = await isInviteValid(inviteCode.value)
    if (!ok) {
      accessError.value =
        'Code d’invitation invalide ou déjà utilisé. Demandez un nouveau lien à l’administration.'
      checkingCode.value = false
      return
    }
    accessAllowed.value = true
  } catch {
    accessError.value = 'Impossible de vérifier le code. Réessayez plus tard.'
  } finally {
    checkingCode.value = false
  }
})

const onSubmit = async () => {
  formError.value = null
  if (!accessAllowed.value || !inviteCode.value) return

  submitting.value = true

  try {
    if (mode.value === 'activate') {
      await activateIngeRoleWithInvite(email.value, password.value, inviteCode.value)
    } else {
      await signupAsIngeWithInvite(email.value, password.value, inviteCode.value)
    }

    if (authReady.value && currentUser.value?.role !== 'inge') {
      formError.value =
        'Le compte a été créé mais le rôle ingé n’a pas été enregistré. Contacte l’administration.'
      return
    }

    await router.push('/dashboard/inge')
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    const msg = err?.message ?? 'Erreur lors de la création du compte'

    if (err?.code === 'auth/email-already-in-use' || msg.includes('déjà un compte')) {
      mode.value = 'activate'
      formError.value =
        'Cet email a déjà un compte. Utilise le même mot de passe pour activer le rôle ingé son.'
      return
    }

    if (msg.includes('invitation') || msg.includes('Code')) {
      accessAllowed.value = false
      accessError.value = msg
    } else {
      formError.value = msg
    }
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
          INSCRIPTION INGÉ SON
        </h1>

        <p v-if="checkingCode" class="mb-10 text-center text-sm text-white/50">
          Vérification du code d’invitation…
        </p>

        <template v-else-if="!accessAllowed">
          <p class="mb-8 text-center text-sm text-red-400">
            {{ accessError }}
          </p>
          <p class="text-center text-sm text-[#888]">
            <NuxtLink
              to="/login"
              class="font-medium text-white/90 underline-offset-4 hover:text-white hover:underline"
            >
              Retour à la connexion
            </NuxtLink>
          </p>
        </template>

        <template v-else>
          <p class="mb-10 text-center text-sm text-white/50">
            <template v-if="mode === 'signup'">
              Crée ton compte ingé son PDS. Ce lien ne peut être utilisé qu’une seule fois.
            </template>
            <template v-else>
              Active le rôle ingé son sur ton compte existant avec ce code à usage unique.
            </template>
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
            <p v-if="formError" class="text-center text-sm text-amber-400">
              {{ formError }}
            </p>
            <button
              type="submit"
              class="auth-pill-submit w-full"
              :disabled="submitting || loading"
            >
              {{
                submitting
                  ? mode === 'activate'
                    ? 'Activation…'
                    : 'Création…'
                  : mode === 'activate'
                    ? 'Activer le rôle ingé son'
                    : 'Créer mon compte ingé'
              }}
            </button>
          </form>

          <p class="mt-8 text-center text-sm text-[#888]">
            Tu as déjà un compte ?
            <NuxtLink
              to="/login"
              class="ml-1 font-medium text-white/90 underline-offset-4 hover:text-white hover:underline"
            >
              Se connecter
            </NuxtLink>
          </p>
        </template>
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
