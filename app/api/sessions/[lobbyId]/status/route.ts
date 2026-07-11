/**
 * GET /api/sessions/[lobbyId]/status
 *
 * Returns just the coarse lifecycle status of a session, read server-side via
 * the Admin SDK so it works for ANY authenticated caller — including a fresh
 * anonymous interviewer whose per-browser UID isn't on the session doc and
 * therefore can't read it directly under Firestore rules (which gate session
 * reads to the matched candidateId / interviewerId).
 *
 * This exists specifically so dead-link detection ("this session already
 * ended") works from a browser other than the one that ran the session.
 * The client-side getDoc path can only ever succeed for the two participants;
 * everyone else hits permission-denied and used to fall through to the live
 * welcome flow.
 *
 * Exposes ONLY { exists, status } — no participant identities, emails, scores,
 * recording URLs, or timestamps. The lobbyId is itself the capability (it's in
 * the shared invite link), so returning a lifecycle string to a signed-in
 * caller who already holds the link leaks nothing meaningful.
 */
import { adminDb } from '@/lib/firebase/admin'
import { jsonOk } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'

export const runtime = 'nodejs'

export const GET = authenticatedRoute<{ lobbyId: string }>(
  '/api/sessions/[lobbyId]/status',
  async (_request, _caller, { lobbyId }) => {
    const snap = await adminDb.collection('sessions').doc(lobbyId).get()
    if (!snap.exists) {
      return jsonOk({ exists: false, status: null })
    }
    const status = snap.data()?.status
    return jsonOk({
      exists: true,
      status: typeof status === 'string' ? status : null,
    })
  },
)
