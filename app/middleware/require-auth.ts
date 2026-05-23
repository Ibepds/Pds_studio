import { useAuth, type UserRole } from '../../composables/useAuth'

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  const { currentUser, ensureAuthReady } = useAuth()
  await ensureAuthReady()

  const user = currentUser.value
  const authRoles = to.meta.authRoles as UserRole[] | undefined

  if (authRoles?.length) {
    if (!user) {
      return navigateTo({
        path: '/login',
        query: { redirect: to.fullPath },
      })
    }
    if (user.role !== 'admin' && !authRoles.includes(user.role)) {
      return navigateTo('/')
    }
    return
  }

  if (!user) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }

  const requiredRole = (to.meta.role as UserRole | undefined) ?? undefined
  if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
    if (user.role === 'booker') return navigateTo('/dashboard/booker')
    if (user.role === 'inge') return navigateTo('/dashboard/inge')
    if (user.role === 'beatmaker') return navigateTo('/dashboard/beatmaker')
    if (user.role === 'reviewer') return navigateTo('/avis-sessions')
    return navigateTo('/')
  }
})
