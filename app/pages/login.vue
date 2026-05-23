<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../../composables/useAuth'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { login, currentUser, loading, ensureAuthReady } = useAuth()

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

const redirectTo = computed(() => {
  const r = route.query.redirect
  const raw = Array.isArray(r) ? r[0] : r
  return typeof raw === 'string' && raw.startsWith('/') ? raw : null
})

function destinationForRole(role: string | undefined): string {
  if (redirectTo.value) return redirectTo.value
  if (role === 'admin') return '/admin/indicateurs'
  if (role === 'reviewer') return '/avis-sessions'
  if (role === 'booker' || role === 'inge' || role === 'beatmaker') {
    return `/dashboard/${role}`
  }
  return '/'
}

onMounted(async () => {
  await ensureAuthReady()
  const u = currentUser.value
  if (!u) return
  if (redirectTo.value === '/avis-sessions' || u.role === 'reviewer') {
    await router.replace('/avis-sessions')
  } else if (u.role === 'admin') {
    await router.replace('/admin/indicateurs')
  }
})

const onSubmit = async () => {
  error.value = null
  submitting.value = true
  try {
    await login(email.value, password.value)
    await ensureAuthReady()
    const r = currentUser.value?.role
    if (!r) {
      error.value =
        'Profil utilisateur introuvable dans Firestore. Vérifie que users/{uid} contient role: "reviewer".'
      return
    }
    await router.push(destinationForRole(r))
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Erreur de connexion'
  } finally {
    submitting.value = false
  }
}

const roleFromQuery = computed(() => route.query.role as string | undefined)
</script>
