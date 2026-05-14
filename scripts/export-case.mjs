import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const serviceAccountPath = path.resolve(projectRoot, 'serviceAccountKey.json')

// Usage:
//   node scripts/export-case.mjs case-5
//   node scripts/export-case.mjs case-5 --out data/case-5.json
//   node scripts/export-case.mjs --all
//   node scripts/export-case.mjs --all --out data/cases-export.json

const args = process.argv.slice(2)

const exportAll = args.includes('--all')
const outIndex = args.indexOf('--out')
const outArg = outIndex !== -1 ? args[outIndex + 1] : null

const docId = !exportAll ? args.find((a) => !a.startsWith('--')) : null

if (!exportAll && !docId) {
  console.error('Usage:')
  console.error('  node scripts/export-case.mjs <docId>           # export one case')
  console.error('  node scripts/export-case.mjs <docId> --out <file>')
  console.error('  node scripts/export-case.mjs --all             # export all cases')
  console.error('  node scripts/export-case.mjs --all --out <file>')
  process.exit(1)
}

async function main() {
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account key not found: ${serviceAccountPath}\nDownload it from Firebase Console → Project Settings → Service Accounts.`)
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  const db = admin.firestore()

  let cases = []

  if (exportAll) {
    const snapshot = await db.collection('cases').get()
    snapshot.forEach((docSnap) => {
      cases.push({ docId: docSnap.id, ...docSnap.data() })
    })
    // Sort by numeric id field if present
    cases.sort((a, b) => {
      if (typeof a.id === 'number' && typeof b.id === 'number') return a.id - b.id
      return String(a.docId).localeCompare(String(b.docId))
    })
    console.log(`Fetched ${cases.length} cases.`)
  } else {
    const docSnap = await db.collection('cases').doc(docId).get()
    if (!docSnap.exists) {
      throw new Error(`No case found with docId: "${docId}"`)
    }
    cases = [{ docId: docSnap.id, ...docSnap.data() }]
    console.log(`Fetched case: ${cases[0].title ?? docId}`)
  }

  // Firestore Timestamps → ISO strings for clean JSON
  function serialize(value) {
    if (value && typeof value.toDate === 'function') return value.toDate().toISOString()
    if (Array.isArray(value)) return value.map(serialize)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]))
    }
    return value
  }

  const output = cases.length === 1 ? serialize(cases[0]) : cases.map(serialize)
  const json = JSON.stringify(output, null, 2)

  if (outArg) {
    const outPath = path.resolve(projectRoot, outArg)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, json, 'utf8')
    console.log(`Written to: ${outPath}`)
  } else {
    console.log('\n' + json)
  }
}

main().catch((error) => {
  console.error('\nExport failed.')
  console.error(error.message ?? error)
  process.exit(1)
})
