import { getApps, initializeApp } from 'firebase/app'
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

export type UserRole = 'booker' | 'inge' | 'beatmaker' | 'admin'

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
  if (r === 'inge' || r === 'beatmaker' || r === 'admin') return r as UserRole
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

    const auth = getAuth()
    const db = getFirestore()
    return { auth, db }
  }

  const fetchUserProfile = async (user: User | null) => {
    const { db } = getClients()

    if (!user) {
      authUser.value = null
      return
    }

    if (!db) {
      // SSR ou client sans Firebase initialisé
      if (process.client) {
        console.warn(
          '[PDS auth] Firestore indisponible (db null) — vérifie que tu es bien dans le navigateur',
        )
      }
      authUser.value = null
      return
    }

    const cheminFirestore = `users/${user.uid}`
    console.log('[PDS auth] Chargement profil →', cheminFirestore)

    const userRef = doc(db, 'users', user.uid)
    const snap = await getDoc(userRef)

    if (snap.exists()) {
      const data = snap.data() as {
        role?: unknown
        admin?: unknown
        email?: unknown
      }
      const role = normalizeRoleFromFirestore(data)
      console.log('[PDS auth] Document trouvé', {
        chemin_firestore: cheminFirestore,
        email_auth: user.email,
        email_dans_firestore: data.email,
        champs_bruts: { role: data.role, admin: data.admin },
        role_normalisee: role,
        rappel:
          'Le rôle vient UNIQUEMENT du document dont l’ID = ton UID Auth (ci-dessus). Si tu vois admin ailleurs dans Firestore, ouvre ce document précis par ID.',
      })
      authUser.value = {
        uid: user.uid,
        email: user.email,
        role,
      }
    } else {
      console.log(
        '[PDS auth] Aucun document users/' +
          user.uid +
          ' — rôle par défaut booker',
      )
      // fallback si aucun profil Firestore
      authUser.value = {
        uid: user.uid,
        email: user.email,
        role: 'booker',
      }
    }
  }

  // Synchronisation avec l'état Firebase (comme dans l'exemple JS)
  if (process.client && !authWatcherInitialized) {
    const { auth } = getClients()

    if (auth) {
      authWatcherInitialized = true

      onAuthStateChanged(auth, async (fbUser: User | null) => {
        authReady.value = true

        if (fbUser) {
          console.log('[PDS auth] onAuthStateChanged: connecté', fbUser.uid)
          await fetchUserProfile(fbUser)
        } else {
          console.log('[PDS auth] onAuthStateChanged: déconnecté')
          authUser.value = null
        }
      })
    }
  }

  const signup = async (email: string, password: string, role: UserRole) => {
    const { auth, db } = getClients()
    loading.value = true
    error.value = null

    try {
      if (!auth || !db) {
        throw new Error('Firebase non initialisé côté client')
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password)
      const userRef = doc(db, 'users', cred.user.uid)

      await setDoc(userRef, {
        email,
        role,
        createdAt: new Date(),
      })

      try {
        await sendEmailVerification(cred.user)
      } catch (e) {
        console.error('[auth] sendEmailVerification error', e)
      }

      await fetchUserProfile(cred.user)
      return cred
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors de la création du compte'
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
        throw new Error('Firebase non initialisé côté client')
      }

      const cred = await signInWithEmailAndPassword(auth, email, password)
      await fetchUserProfile(cred.user)
      return cred
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur de connexion'
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
        throw new Error('Firebase non initialisé côté client')
      }

      await signOut(auth)
      authUser.value = null
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors de la déconnexion'
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    authUser,
    authReady,
    currentUser,
    loading,
    error,
    signup,
    login,
    logout,
  }
}
