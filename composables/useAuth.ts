import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type User,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
} from 'firebase/auth'
import { doc, getDoc, setDoc, getFirestore } from 'firebase/firestore'
import { toFrenchFirebaseAuthError } from '../utils/firestoreErrors'
import { watch } from 'vue'
import { normalizeIngeInviteCode, useIngeInvites } from './useIngeInvites'

export type UserRole = 'booker' | 'inge' | 'beatmaker' | 'admin' | 'reviewer'

export interface AppUser {
  uid: string
  email: string | null
  role: UserRole
}

/** Lit le rôle Firestore (casse, alias) + champ optionnel `admin: true`. */
function normalizeRoleFromFirestore(data: {
  role?: unknown
  admin?: unknown
}): UserRole {
  if (data.admin === true || data.admin === 'true' || data.admin === 1) {
    return 'admin'
  }
  const raw = data.role
  if (typeof raw !== 'string') return 'booker'
  const r = raw.trim().toLowerCase()
  if (
    r === 'admin' ||
    r === 'administrator' ||
    r === 'superadmin' ||
    r === 'super-admin'
  ) {
    return 'admin'
  }
  if (r === 'inge' || r === 'ingé' || r === 'ingenieur' || r === 'ingénieur') {
    return 'inge'
  }
  if (r === 'beatmaker' || r === 'producer') return 'beatmaker'
  if (r === 'booker') return 'booker'
  if (r === 'reviewer' || r === 'critique' || r === 'avis') return 'reviewer'
  if (r === 'inge' || r === 'beatmaker' || r === 'admin' || r === 'reviewer') return r as UserRole
  return 'booker'
}

// Pour éviter d'initialiser plusieurs fois le watcher d'auth
let authWatcherInitialized = false

export const useAuth = () => {
  // États globaux (partagés entre toutes les pages)
  const authUser = useState<AppUser | null>('authUser', () => null)
  const currentUser = authUser // alias de compatibilité
  const authReady = useState('authReady', () => false)
  const loading = useState('authLoading', () => false)
  const error = useState<string | null>('authError', () => null)

  const getClients = () => {
    // Côté serveur : pas de Firebase client
    if (!process.client) {
      return { auth: null as any, db: null as any }
    }

    // Initialise Firebase ici si besoin (fallback indépendant du plugin)
    if (!getApps().length) {
      const config = useRuntimeConfig()
      const firebaseConfig = {
        apiKey: config.public.firebaseApiKey,
        authDomain: config.public.firebaseAuthDomain,
        projectId: config.public.firebaseProjectId,
        storageBucket: config.public.firebaseStorageBucket,
        messagingSenderId: config.public.firebaseMessagingSenderId,
        appId: config.public.firebaseAppId,
      }
      initializeApp(firebaseConfig)
    }

    const app = getApp()
    const auth = getAuth(app)
    const db = getFirestore(app)
    return { auth, db }
  }

  /** Pendant writeUserProfile : bloque onAuthStateChanged qui remettrait booker trop tôt */
  const profileWriteLock = useState('authProfileWriteLock', () => false)

  const readProfileFromFirestore = async (uid: string, retries = 4): Promise<AppUser | null> => {
    const { db } = getClients()
    if (!db) return null

    const userRef = doc(db, 'users', uid)
    for (let i = 0; i < retries; i++) {
      const snap = await getDoc(userRef)
      if (snap.exists()) {
        const data = snap.data() as { role?: unknown; admin?: unknown; email?: unknown }
        return {
          uid,
          email: (data.email as string | undefined) ?? null,
          role: normalizeRoleFromFirestore(data),
        }
      }
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, 150))
      }
    }
    return null
  }

  const fetchUserProfile = async (user: User | null) => {
    if (profileWriteLock.value) return

    const { db } = getClients()

    if (!user) {
      authUser.value = null
      return
    }

    if (!db) {
      if (process.client) {
        console.warn(
          '[PDS auth] Firestore indisponible (db null) — vérifie que tu es bien dans le navigateur',
        )
      }
      authUser.value = null
      return
    }

    const profile = await readProfileFromFirestore(user.uid)
    if (profile) {
      authUser.value = {
        uid: user.uid,
        email: user.email ?? profile.email,
        role: profile.role,
      }
      return
    }

    authUser.value = {
      uid: user.uid,
      email: user.email,
      role: 'booker',
    }
  }

  // Synchronisation avec l'état Firebase (comme dans l'exemple JS)
  if (process.client && !authWatcherInitialized) {
    const { auth } = getClients()

    if (auth) {
      authWatcherInitialized = true

      onAuthStateChanged(auth, async (fbUser: User | null) => {
        if (profileWriteLock.value) {
          authReady.value = true
          return
        }

        if (fbUser) {
          await fetchUserProfile(fbUser)
        } else {
          authUser.value = null
        }

        authReady.value = true
      })
    }
  }

  const writeUserProfile = async (
    uid: string,
    email: string,
    role: UserRole,
    fbEmail: string | null,
  ) => {
    const { db } = getClients()
    if (!db) throw new Error('Application non prête. Rechargez la page.')

    profileWriteLock.value = true
    try {
      const userRef = doc(db, 'users', uid)
      await setDoc(userRef, {
        email,
        role,
        createdAt: new Date(),
      })

      const profile = await readProfileFromFirestore(uid, 6)
      if (!profile || profile.role !== role) {
        throw new Error(
          'Impossible d’enregistrer votre profil. Reconnectez-vous ou contactez le studio.',
        )
      }

      authUser.value = {
        uid,
        email: fbEmail ?? email,
        role: profile.role,
      }
    } finally {
      profileWriteLock.value = false
    }
  }

  const signup = async (email: string, password: string, role: UserRole) => {
    const { auth, db } = getClients()
    loading.value = true
    error.value = null

    try {
      if (!auth || !db) {
        throw new Error('Application non prête. Rechargez la page.')
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await writeUserProfile(cred.user.uid, email, role, cred.user.email)

      try {
        await sendEmailVerification(cred.user)
      } catch (e) {
        console.error('[auth] sendEmailVerification error', e)
      }

      return cred
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors de la création du compte'
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Compte existant : connexion puis mise à jour du rôle ingé + consommation du code */
  const activateIngeRoleWithInvite = async (
    email: string,
    password: string,
    rawInviteCode: string,
  ) => {
    const { auth, db } = getClients()
    const { isInviteValid, claimInviteCode } = useIngeInvites()
    const code = normalizeIngeInviteCode(rawInviteCode)

    loading.value = true
    error.value = null

    try {
      if (!auth || !db) {
        throw new Error('Application non prête. Rechargez la page.')
      }

      const valid = await isInviteValid(code)
      if (!valid) {
        throw new Error('Code d’invitation invalide ou déjà utilisé.')
      }

      const cred = await signInWithEmailAndPassword(auth, email, password)
      await writeUserProfile(cred.user.uid, email, 'inge', cred.user.email)
      await claimInviteCode(code)

      return cred
    } catch (e: any) {
      error.value = e?.message ?? 'Impossible d’activer le compte ingé'
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Inscription ingé via lien admin : rôle forcé à `inge`, code consommé après succès */
  const signupAsIngeWithInvite = async (
    email: string,
    password: string,
    rawInviteCode: string,
  ) => {
    const { auth, db } = getClients()
    const { isInviteValid, claimInviteCode } = useIngeInvites()
    const code = normalizeIngeInviteCode(rawInviteCode)

    loading.value = true
    error.value = null

    try {
      if (!auth || !db) {
        throw new Error('Application non prête. Rechargez la page.')
      }
      if (!code) {
        throw new Error('Code d’invitation manquant.')
      }

      const valid = await isInviteValid(code)
      if (!valid) {
        throw new Error('Code d’invitation invalide ou déjà utilisé.')
      }

      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await writeUserProfile(cred.user.uid, email, 'inge', cred.user.email)
        await claimInviteCode(code)

        try {
          await sendEmailVerification(cred.user)
        } catch (e) {
          console.error('[auth] sendEmailVerification error', e)
        }

        return cred
      } catch (e: any) {
        const firebaseCode = e?.code as string | undefined
        if (firebaseCode === 'auth/email-already-in-use') {
          return await activateIngeRoleWithInvite(email, password, code)
        }
        throw e
      }
    } catch (e: any) {
      error.value = toFrenchFirebaseAuthError(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  const login = async (email: string, password: string) => {
    const { auth } = getClients()
    loading.value = true
    error.value = null

    try {
      if (!auth) {
        throw new Error('Application non prête. Rechargez la page.')
      }

      const cred = await signInWithEmailAndPassword(auth, email, password)
      await fetchUserProfile(cred.user)
      return cred
    } catch (e: any) {
      error.value = toFrenchFirebaseAuthError(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  const logout = async () => {
    const { auth } = getClients()
    loading.value = true
    error.value = null

    try {
      if (!auth) {
        throw new Error('Application non prête. Rechargez la page.')
      }

      await signOut(auth)
      authUser.value = null
    } catch (e: any) {
      error.value = toFrenchFirebaseAuthError(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Attendre Firebase Auth + profil Firestore (middleware / login). */
  const ensureAuthReady = async () => {
    if (!process.client) return

    if (authReady.value) {
      const { auth } = getClients()
      if (!auth?.currentUser || currentUser.value) return
    }

    await new Promise<void>((resolve) => {
      const stop = watch(
        [authReady, authUser],
        () => {
          if (!authReady.value) return
          const { auth } = getClients()
          if (!auth?.currentUser || currentUser.value) {
            stop()
            resolve()
          }
        },
        { immediate: true },
      )
      setTimeout(() => {
        stop()
        resolve()
      }, 4000)
    })
  }

  return {
    authUser,
    authReady,
    currentUser,
    loading,
    error,
    signup,
    signupAsIngeWithInvite,
    activateIngeRoleWithInvite,
    login,
    logout,
    ensureAuthReady,
  }
}
