import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import { env, hasFirebase } from './env'

let app: FirebaseApp | null = null
let db: Firestore | null = null
let emulatorConnected = false

function firebaseConfig() {
  return {
    apiKey: env.firebaseApiKey || 'demo',
    authDomain: env.firebaseAuthDomain || `${env.firebaseProjectId}.firebaseapp.com`,
    projectId: env.firebaseProjectId as string,
    storageBucket: env.firebaseStorageBucket || `${env.firebaseProjectId}.appspot.com`,
    messagingSenderId: env.firebaseMessagingSenderId || '0',
    appId: env.firebaseAppId || 'demo',
  }
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!hasFirebase()) return null
  if (app) return app
  app = getApps()[0] ?? initializeApp(firebaseConfig())
  return app
}

export function getFirebaseDb(): Firestore | null {
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return null
  if (db) return db
  db = getFirestore(firebaseApp)
  if (env.firebaseUseEmulator && !emulatorConnected) {
    try {
      connectFirestoreEmulator(db, '127.0.0.1', 8080)
    } catch {
      // HMR 등으로 이미 연결된 경우
    }
    emulatorConnected = true
  }
  return db
}

export { hasFirebase }
