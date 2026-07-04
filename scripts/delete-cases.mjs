import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const serviceAccountPath = path.resolve(projectRoot, 'serviceAccountKey.json')

const docIds = process.argv.slice(2)
if (docIds.length === 0) {
  throw new Error('Usage: node scripts/delete-cases.mjs <docId> [docId...]')
}

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(`Service account key not found: ${serviceAccountPath}`)
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

for (const docId of docIds) {
  const ref = db.collection('cases').doc(docId)
  const snap = await ref.get()
  if (!snap.exists) {
    console.log(`Skipped (not found): ${docId}`)
    continue
  }
  console.log(`Deleting: ${docId} (${snap.data()?.title ?? 'untitled'})`)
  await ref.delete()
  console.log(`Deleted: ${docId}`)
}
