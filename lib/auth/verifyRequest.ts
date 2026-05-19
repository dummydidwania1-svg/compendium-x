/**
 * Verify a Firebase ID token attached to an incoming API request.
 *
 * The single auth boundary for every protected route. Returns the decoded
 * caller identity or throws a typed `AuthError` describing the HTTP status,
 * error code, and a safe message to surface back to the client.
 */
import 'server-only'
import { adminAuth } from '@/lib/firebase/admin'

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export interface VerifiedCaller {
  uid: string
  email: string | null
  /** Raw bearer token; useful for routes that need to forward it. */
  token: string
}

function readBearer(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

/**
 * Pull the bearer token off the request, verify with the Admin SDK
 * (signature + expiry, no revocation roundtrip), and return the caller's
 * identity.
 */
export async function verifyRequest(request: Request): Promise<VerifiedCaller> {
  const token = readBearer(request.headers.get('authorization'))
  if (!token) {
    throw new AuthError(401, 'missing_token', 'Authorization header is missing or malformed.')
  }

  try {
    // verifyIdToken(token) without the `checkRevoked` second arg verifies
    // signature + expiry locally using the cached public keys (~5-10ms).
    // Passing `true` would force a round-trip to Google's identitytoolkit
    // API on every authenticated request, adding 300-800ms of latency. For
    // this app, revocation events (sign-out, password change) are rare
    // enough that the 1hr token lifetime is an acceptable upper bound on
    // the window where a revoked token could still hit our routes, and
    // Firestore rules are the real defense anyway.
    const decoded = await adminAuth.verifyIdToken(token)
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      token,
    }
  } catch (err) {
    throw new AuthError(
      401,
      'invalid_token',
      err instanceof Error ? err.message : 'Token verification failed.',
    )
  }
}

/**
 * Convenience helper for route handlers: catches `AuthError` and turns it
 * into the standard error response shape, while re-throwing anything else.
 */
export function isAuthError(value: unknown): value is AuthError {
  return value instanceof AuthError
}
