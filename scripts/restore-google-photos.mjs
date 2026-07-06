// One-time repair: a bug in the old avatar-upload flow called
// updateProfile(user, { photoURL: <uploaded image URL> }), which permanently
// overwrote the Auth user's top-level photoURL — clobbering the real Google
// account photo reference with whatever the user had last uploaded.
//
// The real Google photo is NOT lost: Firebase keeps it untouched on the
// google.com entry inside providerData, separate from the top-level field
// that got overwritten. This script restores the top-level photoURL from
// providerData for every Google-signed-in user where they differ, and
// seeds profiles/{uid}.googlePhotoURL so the forum (which can only read
// Firestore, never another user's live Auth state) can show it too.
//
// Usage: node scripts/restore-google-photos.mjs [--dry-run]
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const serviceAccountPath = path.resolve(projectRoot, 'serviceAccountKey.json')

const dryRun = process.argv.includes('--dry-run')

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(`Service account key not found: ${serviceAccountPath}`)
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

const auth = admin.auth()
const db = admin.firestore()

console.log(`Scanning all Auth users for Google-photo mismatches...${dryRun ? ' (dry run — no writes)' : ''}`)

let scanned = 0
let repaired = 0
let pageToken

do {
  const page = await auth.listUsers(1000, pageToken)
  pageToken = page.pageToken

  for (const user of page.users) {
    scanned += 1
    const googleProvider = user.providerData.find((p) => p.providerId === 'google.com')
    if (!googleProvider?.photoURL) continue // not a Google sign-in, or Google never gave a photo

    const realGooglePhoto = googleProvider.photoURL
    const mismatched = user.photoURL !== realGooglePhoto

    if (!mismatched) {
      // Already correct — still make sure Firestore has the mirror.
      if (!dryRun) {
        await db.collection('profiles').doc(user.uid).set(
          { googlePhotoURL: realGooglePhoto },
          { merge: true },
        )
      }
      continue
    }

    repaired += 1
    console.log(`  ${user.email ?? user.uid}: photoURL was poisoned, restoring Google photo`)
    console.log(`    old: ${user.photoURL}`)
    console.log(`    new: ${realGooglePhoto}`)

    if (!dryRun) {
      await auth.updateUser(user.uid, { photoURL: realGooglePhoto })
      await db.collection('profiles').doc(user.uid).set(
        { googlePhotoURL: realGooglePhoto },
        { merge: true },
      )
    }
  }
} while (pageToken)

console.log(`Scanned ${scanned} user(s). ${dryRun ? 'Would repair' : 'Repaired'} ${repaired} poisoned account(s).`)
