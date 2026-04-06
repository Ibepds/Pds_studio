/** Évite /admin « vide » : redirection avant rendu (pas de await navigateTo dans setup). */
export default defineNuxtRouteMiddleware(() => {
  return navigateTo('/admin/indicateurs', { replace: true })
})
