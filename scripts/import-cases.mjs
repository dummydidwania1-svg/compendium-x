import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const inputArg = process.argv[2]
const inputPath = inputArg ? path.resolve(projectRoot, inputArg) : path.resolve(projectRoot, 'data', 'cases.json')
const serviceAccountPath = path.resolve(projectRoot, 'serviceAccountKey.json')

function slugify(title = '') {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function validateCase(rawCase, index) {
  const required = ['title', 'industry', 'difficulty', 'prompt', 'framework']
  for (const field of required) {
    if (typeof rawCase[field] !== 'string' || rawCase[field].trim().length === 0) {
      throw new Error(`Case at index ${index} is missing required field "${field}".`)
    }
  }
}

function buildPayload(rawCase) {
  const payload = {
    id: typeof rawCase.id === 'number' ? rawCase.id : undefined,
    title: rawCase.title.trim(),
    industry: rawCase.industry.trim(),
    difficulty: rawCase.difficulty.trim(),
    case_type: typeof rawCase.case_type === 'string' && rawCase.case_type.trim().length > 0
      ? rawCase.case_type.trim()
      : typeof rawCase.caseType === 'string' && rawCase.caseType.trim().length > 0
        ? rawCase.caseType.trim()
        : 'General',
    prompt: rawCase.prompt.trim(),
    framework: rawCase.framework.trim(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
  if (typeof rawCase.company === 'string' && rawCase.company.trim()) {
    payload.company = rawCase.company.trim()
  }
  if (typeof rawCase.round === 'string' && rawCase.round.trim()) {
    payload.round = rawCase.round.trim()
  }

  if (typeof rawCase.subtype === 'string' && rawCase.subtype.trim()) {
  payload.subtype = rawCase.subtype.trim()
}

payload.slug =
  typeof rawCase.slug === 'string' && rawCase.slug.trim()
    ? rawCase.slug.trim()          // explicit override in cases.json wins
    : slugify(rawCase.title)       // otherwise derived from the title

  if (rawCase.frameworkTree && typeof rawCase.frameworkTree === 'object') {
    payload.frameworkTree = rawCase.frameworkTree
  }
  if (rawCase.visualisations === null) {
    payload.visualisations = admin.firestore.FieldValue.delete()
  } else if (Array.isArray(rawCase.visualisations)) {
    // Firestore rejects arrays-of-arrays; serialize VisTable rows as a JSON string.
    payload.visualisations = rawCase.visualisations.map(v => {
      if (v.type === 'table' && Array.isArray(v.rows)) {
        return { ...v, rows: JSON.stringify(v.rows) }
      }
      return v
    })
  }
  if (rawCase.recommendationsTable === null) {
    payload.recommendationsTable = admin.firestore.FieldValue.delete()
  } else if (rawCase.recommendationsTable && typeof rawCase.recommendationsTable === 'object') {
    payload.recommendationsTable = rawCase.recommendationsTable
  }
if (rawCase.recommendationsMatrix === null) {
  payload.recommendationsMatrix = admin.firestore.FieldValue.delete()
} else if (rawCase.recommendationsMatrix && typeof rawCase.recommendationsMatrix === 'object') {
  payload.recommendationsMatrix = rawCase.recommendationsMatrix
}
if (rawCase.abbreviations === null) {
  payload.abbreviations = admin.firestore.FieldValue.delete()
} else if (Array.isArray(rawCase.abbreviations)) {
  payload.abbreviations = rawCase.abbreviations
}
return payload
}

async function main() {
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account key not found: ${serviceAccountPath}`)
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })

  const db = admin.firestore()

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`)
  }

  const raw = fs.readFileSync(inputPath, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error('Input JSON must be an array of case objects.')
  }

  if (parsed.length === 0) {
    console.log('No cases found in input file. Nothing to import.')
    return
  }

  let createdCount = 0
  let upsertedCount = 0
const seenSlugs = new Map() // slug -> title, to catch collisions

  for (let i = 0; i < parsed.length; i += 1) {
    const rawCase = parsed[i]
    validateCase(rawCase, i)
const payload = buildPayload(rawCase)

if (seenSlugs.has(payload.slug)) {
  throw new Error(
    `Duplicate slug "${payload.slug}" from "${payload.title}" — already used by "${seenSlugs.get(payload.slug)}". ` +
    `Add a unique "slug" to one of them in cases.json.`,
  )
}
seenSlugs.set(payload.slug, payload.title)

    const providedDocId = typeof rawCase.docId === 'string' ? rawCase.docId.trim() : ''
    const derivedDocId = typeof rawCase.id === 'number' ? `case-${rawCase.id}` : ''
    const docId = providedDocId || derivedDocId

    if (docId) {
      const ref = db.collection('cases').doc(docId)
      // Full overwrite — document in Firestore will exactly match the JSON payload
      await ref.set(payload)
      upsertedCount += 1
      console.log(`Replaced case: ${payload.title} (${docId})`)
    } else {
      const newDoc = await db.collection('cases').add(payload)
      createdCount += 1
      console.log(`Created case: ${payload.title} (${newDoc.id})`)
    }
  }

  console.log('\nImport complete.')
  console.log(`Upserted: ${upsertedCount}`)
  console.log(`Created:  ${createdCount}`)
}

main().catch((error) => {
  console.error('\nCase import failed.')
  console.error(error)
  process.exit(1)
})
