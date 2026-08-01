/**
 * POST /api/signup-geo
 *
 * Called once by the client immediately after Firebase Auth account creation
 * succeeds (both email/password and Google sign-in paths), while the new
 * user is still signed in. Captures a one-time IP geolocation (via
 * ip-api.com, no continuous tracking) plus passively-inferred acquisition
 * attribution (UTM params + referrer, read client-side, never a user-facing
 * question). Writes `profiles/{uid}.signupGeo` / `.signupAttribution` via
 * merge:true — races harmlessly with the `sendWelcomeEmail` auth trigger's
 * own `createdAt` write, since both merge onto disjoint fields.
 *
 * Best-effort only: geolocation lookup failure/timeout never fails this
 * route or blocks the caller's signup flow.
 */
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'

export const runtime = 'nodejs'

const signupGeoInput = z.object({
  utmSource: z.string().nullable().optional(),
  utmMedium: z.string().nullable().optional(),
  utmCampaign: z.string().nullable().optional(),
  referrerHost: z.string().nullable().optional(),
  landingPath: z.string().nullable().optional(),
})

interface IpApiResponse {
  status: 'success' | 'fail'
  country?: string
  regionName?: string
  city?: string
  query?: string
}

async function lookupGeo(ip: string): Promise<{ country?: string; region?: string; city?: string; ip?: string } | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,query`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as IpApiResponse
    if (data.status !== 'success') return null
    return { country: data.country, region: data.regionName, city: data.city, ip: data.query }
  } catch (err) {
    console.error('[signup-geo] ip-api lookup failed', err instanceof Error ? err.message : String(err))
    return null
  }
}

export const POST = authenticatedRoute('/api/signup-geo', async (request, caller) => {
  const body = await parseBody(request, signupGeoInput)

  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0]?.trim()

  const geo = ip ? await lookupGeo(ip) : null

  const update: Record<string, unknown> = {
    signupAttribution: {
      utmSource: body.utmSource ?? null,
      utmMedium: body.utmMedium ?? null,
      utmCampaign: body.utmCampaign ?? null,
      referrerHost: body.referrerHost ?? null,
      landingPath: body.landingPath ?? null,
    },
  }

  update.signupGeo = geo
    ? { ...geo, source: 'ip-api', capturedAt: new Date() }
    : { source: 'unknown', capturedAt: new Date() }

  await adminDb.collection('profiles').doc(caller.uid).set(update, { merge: true })

  return jsonOk({ ok: true })
})
