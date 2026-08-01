/**
 * POST /api/case-view
 *
 * Best-effort, fire-and-forget daily counter increment for case
 * browsing/starting, feeding the weekly KPI report's "viewed but never
 * started" rate. One doc per UTC day (`caseViewAggregates/{dateKey}`),
 * incremented via FieldValue.increment — a platform-wide daily aggregate,
 * not per-user-per-case event logging, which keeps cost flat regardless of
 * traffic volume (same trade-off precedent as sessionMaintenanceSweep
 * reading whole collections instead of adding narrow composite indexes).
 */
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'

const caseViewInput = z.object({
  caseId: z.string().min(1),
  action: z.enum(['view', 'select']),
})

function todayUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export const POST = authenticatedRoute('/api/case-view', async (request, _caller) => {
  const { caseId, action } = await parseBody(request, caseViewInput)
  const dateKey = todayUtcDateKey()
  const ref = adminDb.collection('caseViewAggregates').doc(dateKey)

  const field = action === 'view' ? 'viewsByCase' : 'startsByCase'
  const totalField = action === 'view' ? 'totalViews' : 'totalStarts'

  await ref.set(
    {
      dateKey,
      [field]: { [caseId]: FieldValue.increment(1) },
      [totalField]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  return jsonOk({ ok: true })
})
