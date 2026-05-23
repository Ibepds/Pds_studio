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
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'

interface SessionFile {
  id: string
  sessionId: string
  fileName: string
  url: string
  createdAt: Date
}

export type { SessionFile }

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
      const createdAt = new Date()
      const docRef = await addDoc(col, {
        sessionId,
        fileName: file.name,
        url,
        createdAt,
      })

      await listForSession(sessionId)

      return {
        id: docRef.id,
        sessionId,
        fileName: file.name,
        url,
        createdAt,
      }
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors de l’upload'
      throw e
    } finally {
      loading.value = false
    }
  }

  const fetchForSession = async (sessionId: string): Promise<SessionFile[]> => {
    const { db } = getClients()
    if (!db) return []

    const col = collection(db, 'sessionFiles')
    const q = query(col, where('sessionId', '==', sessionId))
    const snap = await getDocs(q)

    const data: SessionFile[] = []
    snap.forEach((d) => {
      const raw = d.data() as {
        sessionId: string
        fileName: string
        url: string
        createdAt?: Timestamp
      }
      data.push({
        id: d.id,
        sessionId: raw.sessionId,
        fileName: raw.fileName,
        url: raw.url,
        createdAt: raw.createdAt?.toDate() ?? new Date(),
      })
    })
    data.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return data
  }

  /** Tous les fichiers ingé, groupés par sessionId (pour filtrage page avis). */
  const fetchAllGroupedBySession = async (): Promise<Map<string, SessionFile[]>> => {
    const { db } = getClients()
    const map = new Map<string, SessionFile[]>()
    if (!db) return map

    const col = collection(db, 'sessionFiles')
    const snap = await getDocs(col)
    snap.forEach((d) => {
      const raw = d.data() as {
        sessionId: string
        fileName: string
        url: string
        createdAt?: Timestamp
      }
      const file: SessionFile = {
        id: d.id,
        sessionId: raw.sessionId,
        fileName: raw.fileName,
        url: raw.url,
        createdAt: raw.createdAt?.toDate() ?? new Date(),
      }
      const list = map.get(raw.sessionId) ?? []
      list.push(file)
      map.set(raw.sessionId, list)
    })
    for (const [id, list] of map) {
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      map.set(id, list)
    }
    return map
  }

  return {
    files,
    loading,
    error,
    listForSession,
    fetchForSession,
    fetchAllGroupedBySession,
    uploadForSession,
  }
}
