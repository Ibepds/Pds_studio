/** Messages Firebase / Firestore en français, compréhensibles pour l’utilisateur. */

export type FirestoreErrorContext = 'slots' | 'booking' | 'session' | 'profile' | 'generic'

const SESSION_STATUS_FR: Record<string, string> = {
  waiting_payment: 'en attente de paiement',
  pending: 'en attente de confirmation',
  confirmed: 'confirmée',
  cancelled: 'annulée',
  canceled: 'annulée',
  completed: 'terminée',
  done: 'terminée',
}

export function translateSessionStatus(status: string): string {
  return SESSION_STATUS_FR[status] ?? status.replace(/_/g, ' ')
}

/** Erreurs serveur Firebase Admin (paiement, API). */
export const firebaseAdminUserMessage = {
  notConfigured:
    'Impossible de finaliser le paiement : le serveur n’est pas connecté à la base de données. Réessayez dans quelques minutes ou contactez le studio.',
  invalidCredentials:
    'Impossible de finaliser le paiement : problème de configuration serveur. Contactez le studio.',
  sessionNotFound:
    'Réservation introuvable. Elle a peut-être expiré — recommencez la réservation depuis le début.',
  sessionNotPayable: (status: string) =>
    `Cette réservation ne peut plus être payée (statut : ${translateSessionStatus(status)}).`,
  permissionDenied:
    'Accès refusé à la base de données. Contactez le studio si le problème persiste.',
  unavailable:
    'La base de données est temporairement indisponible. Réessayez dans quelques minutes.',
  network:
    'Connexion à la base de données impossible. Vérifiez votre connexion internet et réessayez.',
  unknown: 'Une erreur est survenue lors de l’accès à la base de données. Réessayez plus tard.',
} as const

function extractCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code
    if (typeof code === 'number') return String(code)
  }
  return undefined
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error ?? '')
}

/** Traduit une erreur Firestore côté client (navigateur). */
export function toFrenchFirestoreError(
  error: unknown,
  context: FirestoreErrorContext = 'generic',
): string {
  const code = extractCode(error)
  const msg = extractMessage(error)
  const lower = msg.toLowerCase()

  if (
    code === 'permission-denied' ||
    code === '7' ||
    lower.includes('permission') ||
    lower.includes('insufficient permissions')
  ) {
    if (context === 'slots') {
      return 'Impossible d’afficher les créneaux disponibles. Connectez-vous ou réessayez plus tard. Si vous êtes invité, les accès visiteurs doivent être activés côté studio.'
    }
    if (context === 'booking') {
      return 'Impossible d’enregistrer la réservation : accès refusé. Connectez-vous ou contactez le studio.'
    }
    if (context === 'profile') {
      return 'Impossible de lire votre profil. Déconnectez-vous puis reconnectez-vous, ou contactez le studio.'
    }
    return 'Vous n’avez pas l’autorisation d’accéder à ces informations.'
  }

  if (
    code === 'failed-precondition' ||
    lower.includes('index') ||
    lower.includes('requires an index')
  ) {
    return 'Configuration de la base de données incomplète. Contactez le studio (index Firestore manquant).'
  }

  if (
    code === 'unavailable' ||
    code === '14' ||
    lower.includes('unavailable') ||
    lower.includes('deadline exceeded')
  ) {
    return 'La base de données est temporairement indisponible. Réessayez dans quelques minutes.'
  }

  if (
    code === 'unauthenticated' ||
    code === '16' ||
    lower.includes('unauthenticated') ||
    lower.includes('invalid jwt')
  ) {
    return 'Session expirée ou non autorisée. Reconnectez-vous et réessayez.'
  }

  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('failed to get document') ||
    lower.includes('client is offline')
  ) {
    return 'Connexion à la base de données impossible. Vérifiez votre internet et réessayez.'
  }

  if (lower.includes('firestore non initialisé') || lower.includes('firebase non initialisé')) {
    return 'Application non prête. Rechargez la page et réessayez.'
  }

  if (context === 'slots') {
    return `Impossible de charger les créneaux : ${shortTechnical(msg)}`
  }

  return shortTechnical(msg) || firebaseAdminUserMessage.unknown
}

/** Traduit une erreur Firebase Admin serveur (gRPC / REST). */
export function toFrenchFirebaseAdminError(error: unknown): string {
  const code = extractCode(error)
  const msg = extractMessage(error)
  const lower = msg.toLowerCase()

  if (
    code === '16' ||
    lower.includes('unauthenticated') ||
    lower.includes('invalid_grant') ||
    lower.includes('invalid jwt')
  ) {
    return firebaseAdminUserMessage.invalidCredentials
  }

  if (code === '7' || lower.includes('permission denied')) {
    return firebaseAdminUserMessage.permissionDenied
  }

  if (code === '14' || lower.includes('unavailable')) {
    return firebaseAdminUserMessage.unavailable
  }

  if (lower.includes('network') || lower.includes('econnrefused')) {
    return firebaseAdminUserMessage.network
  }

  return firebaseAdminUserMessage.unknown
}

/** Traduit une erreur Firebase Auth (connexion / inscription). */
export function toFrenchFirebaseAuthError(error: unknown): string {
  const code = extractCode(error)
  const msg = extractMessage(error)

  const authMessages: Record<string, string> = {
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/user-disabled': 'Ce compte a été désactivé. Contactez le studio.',
    'auth/user-not-found': 'E-mail ou mot de passe incorrect.',
    'auth/wrong-password': 'E-mail ou mot de passe incorrect.',
    'auth/invalid-credential': 'E-mail ou mot de passe incorrect.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse e-mail.',
    'auth/weak-password': 'Mot de passe trop faible : minimum 6 caractères.',
    'auth/operation-not-allowed': 'Cette méthode de connexion n’est pas activée.',
    'auth/too-many-requests': 'Trop de tentatives. Patientez quelques minutes puis réessayez.',
    'auth/network-request-failed': 'Problème de connexion internet. Vérifiez votre réseau.',
    'auth/requires-recent-login': 'Reconnectez-vous pour effectuer cette action.',
    'auth/popup-closed-by-user': 'Connexion annulée.',
  }

  if (code && authMessages[code]) return authMessages[code]

  if (msg.includes('Firebase non initialisé')) {
    return 'Application non prête. Rechargez la page et réessayez.'
  }

  if (msg.includes('Code d’invitation')) return msg
  if (msg.includes('Profil utilisateur introuvable')) {
    return 'Profil introuvable. Contactez le studio pour activer votre accès.'
  }

  return shortTechnical(msg) || 'Erreur de connexion. Réessayez.'
}

function shortTechnical(msg: string): string {
  const cleaned = msg
    .replace(/^FirebaseError:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()
  if (!cleaned) return ''
  if (cleaned.length > 160) return `${cleaned.slice(0, 157)}…`
  return cleaned
}
