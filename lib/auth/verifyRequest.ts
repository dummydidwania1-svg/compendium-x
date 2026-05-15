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
 * (including the revocation check), and return the caller's identity.
 */
export async function verifyRequest(request: Request): Promise<VerifiedCaller> {
  const token = readBearer(request.headers.get('authorization'))
  if (!token) {
    throw new AuthError(401, 'missing_token', 'Authorization header is missing or malformed.')
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token, true)
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
