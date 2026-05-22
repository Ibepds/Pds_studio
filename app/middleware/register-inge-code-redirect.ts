/** /register?code=… → /register/inge?code=… (une seule redirection, pas de boucle). */
export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== '/register') return

  const code = to.query.code
  const raw = Array.isArray(code) ? code[0] : code
  if (typeof raw !== 'string' || !raw.trim()) return

  return navigateTo(
    {
      path: '/register/inge',
      query: { code: raw.trim() },
    },
    { replace: true },
  )
})
