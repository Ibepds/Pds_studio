import { getApps, initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  Timestamp,
} from 'firebase/firestore'
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage'

interface SessionFile {
  id: string
  sessionId: string
  fileName: string
  url: string
  createdAt: Date
}

const getClients = () => {
  if (!process.client) return { db: null as any, storage: null as any }

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

  const db = getFirestore()
  const storage = getStorage()
  return { db, storage }
}

export const useSessionFiles = () => {
  const files = useState<SessionFile[]>('sessionFiles', () => [])
  const loading = useState('sessionFilesLoading', () => false)
  const error = useState<string | null>('sessionFilesError', () => null)

  const listForSession = async (sessionId: string) => {
    const { db } = getClients()
    if (!db) return

    loading.value = true
    error.value = null

    try {
      const col = collection(db, 'sessionFiles')
      const q = query(col, where('sessionId', '==', sessionId))
      const snap = await getDocs(q)

      const data: SessionFile[] = []
      snap.forEach((d) => {
        const raw = d.data() as any
        data.push({
          id: d.id,
          sessionId: raw.sessionId,
          fileName: raw.fileName,
          url: raw.url,
          createdAt: (raw.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
        })
      })

      files.value = data
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors du chargement des fichiers'
    } finally {
      loading.value = false
    }
  }

  const uploadForSession = async (sessionId: string, file: File) => {
    const { db, storage } = getClients()
    if (!db || !storage) throw new Error('Firebase non initialisé')

    loading.value = true

    try {
      const path = `sessions/${sessionId}/${Date.now()}-${file.name}`
      const fileRef = storageRef(storage, path)
      await uploadBytes(fileRef, file)
      const url = await getDownloadURL(fileRef)

      const col = collection(db, 'sessionFiles')
      await addDoc(col, {
        sessionId,
        fileName: file.name,
        url,
        createdAt: new Date(),
      })

      await listForSession(sessionId)
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors de l’upload'
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    files,
    loading,
    error,
    listForSession,
    uploadForSession,
  }
}

