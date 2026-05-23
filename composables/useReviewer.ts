import { useAuth } from './useAuth'

/** Accès page /avis-sessions : rôle `reviewer` ou `admin` */
export function useReviewer() {
  const { currentUser } = useAuth()

  const canAccessReviews = computed(() => {
    const u = currentUser.value
    if (!u) return false
    return u.role === 'reviewer' || u.role === 'admin'
  })

  return { canAccessReviews }
}
