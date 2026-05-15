/**
 * Client-side helper for calling our authenticated `/api/...` routes.
 *
 * Grabs the current Firebase user's fresh ID token, attaches it as a Bearer
 * header, and parses the standard `{error:{code,message}}` shape on failures.
 *
 * Usage:
 *   const result = await apiPost<MyResponse>('/api/sessions', { ... })
 *
 * Throws `ApiError` (with status, code, message) on any non-2xx response.
 */
import { auth } from '@/lib/firebase/config'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function getIdTokenOrThrow(): Promise<string> {
  const user = auth.currentUser
  if (!user) {
    throw new ApiError(401, 'unauthenticated', 'You must be signed in to continue.')
  }
  return user.getIdToken()
}

export async function apiPost<TResponse = unknown>(
  path: string,
  body: unknown,
): Promise<TResponse> {
  const token = await getIdTokenOrThrow()

  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new ApiError(
      0,
      'network_error',
      err instanceof Error ? err.message : 'Network request failed.',
    )
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const errBody = payload as { error?: { code?: string; message?: string } } | null
    throw new ApiError(
      response.status,
      errBody?.error?.code ?? 'request_failed',
      errBody?.error?.message ?? `Request failed with status ${response.status}.`,
    )
  }

  return payload as TResponse
}
