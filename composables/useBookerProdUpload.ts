import { getApps, initializeApp } from 'firebase/app'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuth } from './useAuth'

const getStorageInstance = () => {
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
  return getStorage()
}

export const useBookerProdUpload = () => {
  const { currentUser } = useAuth()

  const upload = async (file: File): Promise<{ url: string; fileName: string }> => {
    const storage = getStorageInstance()
    const user = currentUser.value
    if (!storage || !user) throw new Error('Non connecté')
    const path = `bookerProds/${user.uid}/${Date.now()}_${file.name}`
    const storageRef = ref(storage, path)
    await uploadBytes(storageRef, file)
    const url = await getDownloadURL(storageRef)
    return { url, fileName: file.name }
  }

  return { upload }
}
