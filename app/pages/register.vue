<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAuth, type UserRole } from '../../composables/useAuth'
import { useRouter } from 'vue-router'

const router = useRouter()
const { signup, loading } = useAuth()

const email = ref('')
const password = ref('')
const role = ref<UserRole>('booker')
const error = ref<string | null>(null)
const submitting = ref(false)

const roleOptions = [
  { value: 'booker' as const, label: 'Booker' },
  { value: 'inge' as const, label: 'Ingé son' },
  { value: 'beatmaker' as const, label: 'Beatmaker' },
] as const

const roleLabel = computed(
  () => roleOptions.find((o) => o.value === role.value)?.label ?? 'Booker',
)

const roleOpen = ref(false)
const roleSelectRoot = ref<HTMLElement | null>(null)

function closeRoleMenu() {
  roleOpen.value = false
}

function selectRole(value: UserRole) {
  role.value = value
  closeRoleMenu()
}

function onDocClick(e: MouseEvent) {
  const el = roleSelectRoot.value
  if (el && !el.contains(e.target as Node)) closeRoleMenu()
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

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
  <section
    class="auth-page relative flex min-h-[calc(100dvh-5.5rem)] w-full flex-col bg-black"
  >
    <div class="auth-page-glow pointer-events-none absolute inset-x-0 bottom-0 z-0" aria-hidden="true" />

    <div
      class="relative z-10 flex w-full flex-1 flex-col items-center justify-center px-6 py-12 sm:px-10 sm:py-16"
    >
      <div class="w-full max-w-md">
        <h1
          class="mb-4 text-center text-3xl font-bold uppercase tracking-[0.14em] text-white sm:text-4xl"
        >
          INSCRIPTION
        </h1>
        <p class="mb-10 text-center text-sm text-white/50">
          Crée ton compte booker, ingé son ou beatmaker.
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
          <div ref="roleSelectRoot" class="relative z-20">
            <button
              type="button"
              class="auth-role-trigger flex w-full items-center justify-between gap-3 text-left"
              :aria-expanded="roleOpen"
              aria-haspopup="listbox"
              aria-label="Rôle"
              @click.stop="roleOpen = !roleOpen"
            >
              <span class="truncate">{{ roleLabel }}</span>
              <svg
                class="h-5 w-5 shrink-0 text-white/70 transition-transform duration-200"
                :class="{ 'rotate-180': roleOpen }"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            <Transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 -translate-y-1"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition duration-100 ease-in"
              leave-from-class="opacity-100"
              leave-to-class="opacity-0"
            >
              <ul
                v-show="roleOpen"
                class="auth-role-list absolute left-0 right-0 top-[calc(100%+4px)] z-[100]"
                role="listbox"
                :aria-activedescendant="`role-opt-${role}`"
              >
                <li
                  v-for="opt in roleOptions"
                  :id="`role-opt-${opt.value}`"
                  :key="opt.value"
                  role="option"
                  class="auth-role-item"
                  :class="{ 'auth-role-item--selected': role === opt.value }"
                  :aria-selected="role === opt.value"
                  @click.stop="selectRole(opt.value)"
                >
                  {{ opt.label }}
                </li>
              </ul>
            </Transition>
          </div>
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

/* Sélecteur : pilule + panneau aligné sur les inputs (même bordure grise, pas de blanc dur) */
.auth-role-trigger {
  @apply cursor-pointer rounded-full border border-[#3a3a3a] bg-black px-6 py-3.5 text-[15px] font-normal text-white transition-colors;
}
.auth-role-trigger:hover {
  border-color: rgba(255, 255, 255, 0.25);
}
.auth-role-trigger:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.35);
}

.auth-role-list {
  @apply m-0 list-none overflow-hidden rounded-2xl border border-[#3a3a3a] bg-black p-0 shadow-none;
}

.auth-role-item {
  @apply cursor-pointer border-b border-[#2f2f2f] px-4 py-3 text-left text-[15px] text-white transition-colors last:border-b-0;
}
.auth-role-item:hover {
  @apply bg-white/[0.07];
}
.auth-role-item--selected {
  @apply bg-[#3a3a3a] text-white;
}
.auth-role-item--selected:hover {
  @apply bg-[#454545];
}

.auth-pill-submit {
  @apply mt-2 rounded-full border border-[#4a4a4a] bg-transparent px-6 py-3.5 text-[15px] font-medium tracking-wide text-white transition-colors;
}
.auth-pill-submit:disabled {
  @apply cursor-not-allowed opacity-50;
}
</style>
