/**
 * One-off helper: dumps the rules currently deployed to the live Firebase
 * project so we can capture them in source control before changing anything.
 *
 * Usage:
 *   node scripts/dump-live-rules.mjs
 *
 * Requires serviceAccountKey.json in repo root (gitignored).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))
const keyPath = resolve(__dirname, '..', 'serviceAccountKey.json')
const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

const sr = admin.securityRules()

async function dump(label, fetcher) {
  console.log(`\n===== ${label} =====`)
  try {
    const ruleset = await fetcher()
    for (const file of ruleset.source) {
      console.log(`--- ${file.name} ---`)
      console.log(file.content)
    }
  } catch (err) {
    console.log(`(no ruleset found or error) ${err.message}`)
  }
}

const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  || `${serviceAccount.project_id}.firebasestorage.app`

await dump('Firestore rules', () => sr.getFirestoreRuleset())
await dump(`Storage rules (${bucket})`, () => sr.getStorageRuleset(bucket))

// ----- Firestore composite indexes -----
console.log('\n===== Firestore composite indexes =====')
try {
  const auth = admin.app().options.credential
  const { access_token } = await auth.getAccessToken()
  const projectId = serviceAccount.project_id
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/collectionGroups/-/indexes`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const body = await res.json()
  console.log(JSON.stringify(body, null, 2))
} catch (err) {
  console.log(`(error fetching indexes) ${err.message}`)
}

process.exit(0)
