import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  type Auth,
  onAuthStateChanged,
} from 'firebase/auth'
import {
  getFirestore,
  type Firestore,
} from 'firebase/firestore'
import {
  getStorage,
  type FirebaseStorage,
} from 'firebase/storage'

let firebaseApp: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let storage: FirebaseStorage | null = null

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  const firebaseConfig = {
    apiKey: config.public.firebaseApiKey,
    authDomain: config.public.firebaseAuthDomain,
    projectId: config.public.firebaseProjectId,
    storageBucket: config.public.firebaseStorageBucket,
    messagingSenderId: config.public.firebaseMessagingSenderId,
    appId: config.public.firebaseAppId,
  }

  // Initialise Firebase (ou réutilise l'instance existante)
  if (!getApps().length) {
    firebaseApp = initializeApp(firebaseConfig)
  } else {
    firebaseApp = getApps()[0]!
  }

  auth = getAuth(firebaseApp)
  db = getFirestore(firebaseApp)
  storage = getStorage(firebaseApp)

  // Expose instances via Nuxt app
  return {
    provide: {
      firebaseApp,
      firebaseAuth: auth,
      firestore: db,
      storage,
      onAuthStateChanged,
    },
  }
})

