/**
 * One-time backfill: transcode same-device .webm recordings to Opus/WebM via
 * ffmpeg and write mergedAudioUrl so Safari can play them.
 *
 * Targets sessions where:
 *   - sessionMode === 'local' OR mergedAudioUrl is missing (same-device)
 *   - recording.audioUrl exists (has an uploaded file)
 *   - mergedAudioUrl is null/missing (not already transcoded)
 *
 * Run from functions/ directory:
 *   node src/backfill-audio.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const serviceAccount = require('../../serviceAccountKey.json')

initializeApp({
  credential: cert(serviceAccount),
  storageBucket: 'compendium-x.firebasestorage.app',
})

const db = getFirestore()
const execFileAsync = promisify(execFile)

async function getFfmpegPath() {
  const mod = await import('ffmpeg-static')
  return mod.default
}

async function transcodeAudio(sessionId, audioUrl, ffmpegPath) {
  const workDir = await mkdtemp(join(tmpdir(), `transcode-${sessionId}-`))
  const inPath = join(workDir, 'candidate.webm')
  const outPath = join(workDir, 'merged.webm')

  try {
    const res = await fetch(audioUrl)
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
    await writeFile(inPath, Buffer.from(await res.arrayBuffer()))

    await execFileAsync(
      ffmpegPath,
      [
        '-y',
        '-fflags', '+genpts', '-i', inPath,
        '-ac', '1',
        '-c:a', 'libopus',
        '-b:a', '64k',
        outPath,
      ],
      { maxBuffer: 1024 * 1024 * 64 },
    )

    const transcoded = await readFile(outPath)
    const bucket = getStorage().bucket()
    const objectPath = `merged-audio/${sessionId}/merged.webm`
    const token = randomUUID()
    const file = bucket.file(objectPath)
    await file.save(transcoded, {
      resumable: false,
      contentType: 'audio/webm',
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    })

    return (
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(objectPath)}?alt=media&token=${token}`
    )
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function main() {
  const ffmpegPath = await getFfmpegPath()
  if (!ffmpegPath) { console.error('ffmpeg not found'); process.exit(1) }
  console.log('ffmpeg:', ffmpegPath)

  // Fetch all sessions — filter client-side since Firestore OR queries are limited
  const snap = await db.collection('sessions').get()
  const sessions = snap.docs.filter(doc => {
    const d = doc.data()
    const isLocal = d.sessionMode === 'local' || d.sessionMode === 'Same Device' || !d.sessionMode
    const hasAudio = !!d.recording?.audioUrl
    const needsTranscode = !d.mergedAudioUrl
    return isLocal && hasAudio && needsTranscode
  })

  console.log(`Found ${sessions.length} sessions to backfill`)
  if (sessions.length === 0) { console.log('Nothing to do.'); return }

  let ok = 0, failed = 0
  for (const doc of sessions) {
    const sessionId = doc.id
    const audioUrl = doc.data().recording.audioUrl
    process.stdout.write(`  ${sessionId} ... `)
    try {
      const mergedAudioUrl = await transcodeAudio(sessionId, audioUrl, ffmpegPath)
      await db.collection('sessions').doc(sessionId).set(
        { mergedAudioUrl, mergedAudioCompletedAt: FieldValue.serverTimestamp() },
        { merge: true },
      )
      console.log('OK')
      ok++
    } catch (err) {
      console.log(`FAILED: ${err.message}`)
      failed++
    }
  }

  console.log(`\nDone. ${ok} transcoded, ${failed} failed.`)
}

main().catch(err => { console.error(err); process.exit(1) })
