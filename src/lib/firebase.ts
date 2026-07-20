import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const hasRemoteBackend = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
)

const app = hasRemoteBackend ? (getApps().length ? getApp() : initializeApp(config)) : null

export const firebaseAuth: Auth | null = app ? getAuth(app) : null
export const firestore: Firestore | null = app ? getFirestore(app) : null

