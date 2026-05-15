/**
 * Server-only Firebase Admin SDK initialization.
 *
 * Credentials resolved in this order:
 *   1. `FIREBASE_SERVICE_ACCOUNT_JSON` env var — single-line JSON, used in Vercel
 *   2. `serviceAccountKey.json` at repo root — used in local dev (gitignored)
 *
 * When `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1` is set, the SDK is pointed at
 * the local emulators and the real credential is not required.
 */
import 'server-only'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === '1'

if (USE_EMULATORS) {
  // The Admin SDK auto-routes to emulators when these env vars are present.
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099'
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199'
}

type ServiceAccountJson = ServiceAccount & {
  project_id: string
  client_email?: string
  private_key?: string
}

function loadServiceAccount(): ServiceAccountJson {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (fromEnv) {
    try {
      return JSON.parse(fromEnv) as ServiceAccountJson
    } catch (err) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }
  const path = resolve(process.cwd(), 'serviceAccountKey.json')
  return JSON.parse(readFileSync(path, 'utf8')) as ServiceAccountJson
}

function buildApp(): App {
  if (USE_EMULATORS) {
    // Emulators accept any project ID; we just need one consistent identifier.
    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'compendium-x',
    })
  }
  const account = loadServiceAccount()
  return initializeApp({
    credential: cert(account),
    projectId: account.project_id,
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${account.project_id}.firebasestorage.app`,
  })
}

export const adminApp: App = getApps()[0] ?? buildApp()
export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)
export const adminStorage = getStorage(adminApp)
