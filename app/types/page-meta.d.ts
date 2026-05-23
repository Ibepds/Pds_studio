import type { UserRole } from '../../composables/useAuth'

declare module '#app' {
  interface PageMeta {
    /** Rôles autorisés (ex. page avis sessions). Les admins passent toujours. */
    authRoles?: UserRole[]
  }
}

export {}
