import { getApps, initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  doc,
  getDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore'
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { useAuth, type AppUser } from './useAuth'

export interface Beat {
  id: string
  ownerId: string
  ownerEmail: string | null
  title: string
  style: string
  bpm?: number
  price?: number
  url: string
  storagePath?: string
  isPublic: boolean
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

export const useBeats = () => {
  const { currentUser } = useAuth()

  const beats = useState<Beat[]>('beats', () => [])
  const myBeats = useState<Beat[]>('myBeats', () => [])
  const loading = useState('beatsLoading', () => false)
  const error = useState<string | null>('beatsError', () => null)

  const listAllPublic = async () => {
    const { db } = getClients()
    if (!db) return

    loading.value = true
    error.value = null

    try {
      const col = collection(db, 'beats')
      const qBeats = query(col, where('isPublic', '==', true), orderBy('createdAt', 'desc'))
      const snap = await getDocs(qBeats)

      const data: Beat[] = []
      snap.forEach((d) => {
        const raw = d.data() as any
        data.push({
          id: d.id,
          ownerId: raw.ownerId,
          ownerEmail: raw.ownerEmail ?? null,
          title: raw.title ?? '',
          style: raw.style ?? '',
          bpm: raw.bpm,
          price: raw.price,
          url: raw.url,
          storagePath: raw.storagePath,
          isPublic: !!raw.isPublic,
          createdAt: (raw.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
        })
      })

      beats.value = data
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors du chargement des prods'
    } finally {
      loading.value = false
    }
  }

  const listForCurrentBeatmaker = async () => {
    const { db } = getClients()
    const user = currentUser.value as AppUser | null
    if (!db || !user) return

    loading.value = true
    error.value = null

    try {
      const col = collection(db, 'beats')
      const qBeats = query(col, where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'))
      const snap = await getDocs(qBeats)

      const data: Beat[] = []
      snap.forEach((d) => {
        const raw = d.data() as any
        data.push({
          id: d.id,
          ownerId: raw.ownerId,
          ownerEmail: raw.ownerEmail ?? null,
          title: raw.title ?? '',
          style: raw.style ?? '',
          bpm: raw.bpm,
          price: raw.price,
          url: raw.url,
          storagePath: raw.storagePath,
          isPublic: !!raw.isPublic,
          createdAt: (raw.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
        })
      })

      myBeats.value = data
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors du chargement de tes prods'
    } finally {
      loading.value = false
    }
  }

  /** Abonnement temps réel : myBeats se met à jour tout seul (upload, suppression, etc.) */
  const subscribeMyBeats = () => {
    const { db } = getClients()
    const user = currentUser.value as AppUser | null
    if (!db || !user) return () => {}

    const col = collection(db, 'beats')
    const q = query(col, where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data: Beat[] = []
        snap.forEach((d) => {
          const raw = d.data() as any
          data.push({
            id: d.id,
            ownerId: raw.ownerId,
            ownerEmail: raw.ownerEmail ?? null,
            title: raw.title ?? '',
            style: raw.style ?? '',
            bpm: raw.bpm,
            price: raw.price,
            url: raw.url,
            storagePath: raw.storagePath,
            isPublic: !!raw.isPublic,
            createdAt: (raw.createdAt as Timestamp | undefined)?.toDate() ?? new Date(),
          })
        })
        myBeats.value = data
      },
      (err) => {
        error.value = err?.message ?? 'Erreur abonnement prods'
      },
    )
    return unsubscribe
  }

  const uploadBeat = async (file: File, meta: { title: string; style: string; bpm?: number; price?: number; isPublic: boolean }) => {
    const { db, storage } = getClients()
    const user = currentUser.value as AppUser | null
    if (!db || !storage || !user) throw new Error('Utilisateur non connecté')

    loading.value = true
    error.value = null

    try {
      const path = `beats/${user.uid}/${Date.now()}-${file.name}`
      const fileRef = storageRef(storage, path)
      await uploadBytes(fileRef, file)
      const url = await getDownloadURL(fileRef)

      const col = collection(db, 'beats')
      await addDoc(col, {
        ownerId: user.uid,
        ownerEmail: user.email,
        title: meta.title || file.name,
        style: meta.style,
        bpm: meta.bpm ?? null,
        price: meta.price ?? null,
        url,
        storagePath: path,
        isPublic: meta.isPublic,
        createdAt: new Date(),
      })

      await listAllPublic()
    } catch (e: any) {
      error.value = e?.message ?? 'Erreur lors de l’upload de la prod'
      throw e
    } finally {
      loading.value = false
    }
  }

  const deleteBeat = async (beatId: string) => {
    const { db, storage } = getClients()
    const user = currentUser.value as AppUser | null
    if (!db || !user) throw new Error('Utilisateur non connecté')

    const beatRef = doc(db, 'beats', beatId)
    const snap = await getDoc(beatRef)
    if (!snap.exists()) throw new Error('Prod introuvable')
    const data = snap.data() as any
    if (data.ownerId !== user.uid) throw new Error('Tu ne peux supprimer que tes prods')

    const path = data.storagePath as string | undefined
    await deleteDoc(beatRef)
    if (path && storage) {
      try {
        const fileRef = storageRef(storage, path)
        await deleteObject(fileRef)
      } catch (_) {
        // fichier déjà supprimé ou path invalide, on ignore
      }
    }
    await listAllPublic()
  }

  return {
    beats,
    myBeats,
    loading,
    error,
    listAllPublic,
    listForCurrentBeatmaker,
    subscribeMyBeats,
    uploadBeat,
    deleteBeat,
  }
}

