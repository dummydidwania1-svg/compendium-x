/**
 * POST /api/heartbeat
 *
 * Records that the caller was active today. Writes/updates
 * `activityHeartbeats/{uid}_{dateKey}` — existence of this doc for a given
 * uid+day is what the weekly KPI report treats as "active that day," which
 * makes DAU/WAU/MAU and the unique-vs-recurring split cheap to compute
 * (group by uid, count distinct dateKeys) without a raw per-page-view log.
 *
 * The client is expected to call this at most once per browser session per
 * day (see lib/hooks/useActivityHeartbeat.ts), but this route is itself
 * idempotent-safe for repeat calls within the same day.
 */
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'

const heartbeatInput = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const POST = authenticatedRoute('/api/heartbeat', async (request, caller) => {
  const { dateKey } = await parseBody(request, heartbeatInput)
  const docId = `${caller.uid}_${dateKey}`
  const ref = adminDb.collection('activityHeartbeats').doc(docId)

  const snap = await ref.get()
  if (!snap.exists) {
    await ref.set({
      uid: caller.uid,
      dateKey,
      firstSeenAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
      pingCount: 1,
    })
  } else {
    await ref.set(
      {
        lastSeenAt: FieldValue.serverTimestamp(),
        pingCount: FieldValue.increment(1),
      },
      { merge: true },
    )
  }

  return jsonOk({ ok: true })
})
