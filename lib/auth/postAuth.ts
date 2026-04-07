import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

type PostAuthRouteOptions = {
  fallbackRoute?: string
  timeoutMs?: number
}

async function readPostAuthRoute(uid: string, redirectTarget: string): Promise<string> {
  const profileSnapshot = await getDoc(doc(db, 'profiles', uid))
  const profileData = profileSnapshot.exists() ? profileSnapshot.data() : null
  const hasProfileName =
    typeof profileData?.fullName === 'string' && profileData.fullName.trim().length > 0
  const hasUniversity =
    typeof profileData?.university === 'string' && profileData.university.trim().length > 0

  if (!hasProfileName || !hasUniversity) {
    return `/onboarding?redirect=${encodeURIComponent(redirectTarget)}`
  }

  return redirectTarget
}

export async function getPostAuthRoute(
  uid: string,
  redirectTarget: string,
  options: PostAuthRouteOptions = {}
): Promise<string> {
  const fallbackRoute = options.fallbackRoute ?? redirectTarget
  const timeoutMs = options.timeoutMs ?? 5000

  try {
    const resolvedRoute = await Promise.race([
      readPostAuthRoute(uid, redirectTarget),
      new Promise<string>((resolve) => {
        globalThis.setTimeout(() => resolve(fallbackRoute), timeoutMs)
      }),
    ])

    return resolvedRoute
  } catch {
    return fallbackRoute
  }
}
