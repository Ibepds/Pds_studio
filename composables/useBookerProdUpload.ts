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
    if (!storage) throw new Error('Storage non disponible')

    const user = currentUser.value

    // 🔥 CAS INVITÉ
    if (!user) {
      const alreadyUploaded = sessionStorage.getItem('guestUploadDone')
      if (alreadyUploaded) {
        throw new Error('Upload déjà effectué pour cette session')
      }

      const path = `guestUploads/${Date.now()}_${file.name}`
      const storageRef = ref(storage, path)

      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)

      sessionStorage.setItem('guestUploadDone', 'true')

      return { url, fileName: file.name }
    }

    // 🔥 CAS UTILISATEUR CONNECTÉ
    const path = `bookerProds/${user.uid}/${Date.now()}_${file.name}`
    const storageRef = ref(storage, path)

    await uploadBytes(storageRef, file)
    const url = await getDownloadURL(storageRef)

    return { url, fileName: file.name }
  }

  return { upload }
}
