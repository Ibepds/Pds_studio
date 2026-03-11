import { useAuth, type UserRole } from '../../composables/useAuth'

export default defineNuxtRouteMiddleware(async (to) => {
  const { currentUser, authReady } = useAuth()

  // Attendre que l'auth soit prête côté client
  if (process.client && !authReady.value) {
    await new Promise<void>((resolve) => {
      const stop = watch(
        authReady,
        (ready) => {
          if (ready) {
            stop()
            resolve()
          }
        },
        { immediate: true },
      )
    })
  }

  const user = currentUser.value
  if (!user) {
    return navigateTo('/login')
  }

  const requiredRole = (to.meta.role as UserRole | undefined) ?? undefined
  if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
    // Rediriger vers le dashboard correspondant au rôle de l'utilisateur
    if (user.role === 'booker') return navigateTo('/dashboard/booker')
    if (user.role === 'inge') return navigateTo('/dashboard/inge')
    if (user.role === 'beatmaker') return navigateTo('/dashboard/beatmaker')
    return navigateTo('/')
  }
})
