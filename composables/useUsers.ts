import { collection, getDocs, getFirestore, query, where } from 'firebase/firestore'
import { getApps, initializeApp } from 'firebase/app'
import type { UserRole } from './useAuth'

export interface AppUserPublic {
  uid: string
  email: string | null
  role: UserRole
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
        const data = d.data() as { email?: string; role?: UserRole }
        list.push({
          uid: d.id,
          email: data.email ?? null,
          role: (data.role ?? role) as UserRole,
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

  return { listByRole, loading, error }
}
