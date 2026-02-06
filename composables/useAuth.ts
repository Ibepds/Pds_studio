import { getApps, initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type User,
  getAuth,
  onAuthStateChanged,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  setDoc,
  getFirestore,
} from 'firebase/firestore'

export type UserRole = 'booker' | 'inge' | 'beatmaker'

export interface AppUser {
  uid: string
  email: string | null
  role: UserRole
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

    if (!db || !user) {
      authUser.value = null
      return
    }

    const userRef = doc(db, 'users', user.uid)
    const snap = await getDoc(userRef)

    if (snap.exists()) {
      const data = snap.data() as { role?: UserRole }
      authUser.value = {
        uid: user.uid,
        email: user.email,
        role: data.role ?? 'booker',
      }
    } else {
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
          await fetchUserProfile(fbUser)
        } else {
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

