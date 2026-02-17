import { collection, deleteDoc, doc, getDocs, getFirestore, query, where } from 'firebase/firestore'
import { getApps, initializeApp } from 'firebase/app'
import type { UserRole } from './useAuth'

export interface AppUserPublic {
  uid: string
  email: string | null
  role: UserRole
  /** Numéro pour notifications SMS (ingé / admin) */
  phone?: string | null
}

const getDb = () => {
  if (!process.client) return null
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
  return getFirestore()
}

export const useUsers = () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const listByRole = async (role: 'inge' | 'beatmaker'): Promise<AppUserPublic[]> => {
    const db = getDb()
    if (!db) return []

    loading.value = true
    error.value = null
    try {
      const col = collection(db, 'users')
      const q = query(col, where('role', '==', role))
      const snap = await getDocs(q)
      const list: AppUserPublic[] = []
      snap.forEach((d) => {
        const data = d.data() as { email?: string; role?: UserRole; phone?: string }
        list.push({
          uid: d.id,
          email: data.email ?? null,
          role: (data.role ?? role) as UserRole,
          phone: data.phone ?? null,
        })
      })
      return list
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur chargement utilisateurs'
      return []
    } finally {
      loading.value = false
    }
  }

  /** Supprime le document utilisateur (Firestore). Réservé admin. L'utilisateur perd son rôle ingé/beatmaker. */
  const deleteUser = async (uid: string): Promise<void> => {
    const db = getDb()
    if (!db) throw new Error('Base de données non disponible')
    error.value = null
    const userRef = doc(db, 'users', uid)
    await deleteDoc(userRef)
  }

  return { listByRole, deleteUser, loading, error }
}
