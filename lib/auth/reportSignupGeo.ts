'use client'

/**
 * Fire-and-forget call to /api/signup-geo, made once right after a NEW
 * account is created (while still signed in, so getIdToken() works).
 * Never throws — a failed geo/attribution capture must never block or
 * surface an error in the signup flow.
 */
import type { User } from 'firebase/auth'

export async function reportSignupGeo(user: User): Promise<void> {
  try {
    const token = await user.getIdToken()
    const params = new URLSearchParams(window.location.search)
    let referrerHost: string | null = null
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname : null
    } catch {
      referrerHost = null
    }

    await fetch('/api/signup-geo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        utmSource: params.get('utm_source'),
        utmMedium: params.get('utm_medium'),
        utmCampaign: params.get('utm_campaign'),
        referrerHost,
        landingPath: window.location.pathname,
      }),
    })
  } catch (err) {
    console.error('[reportSignupGeo] failed', err instanceof Error ? err.message : String(err))
  }
}
