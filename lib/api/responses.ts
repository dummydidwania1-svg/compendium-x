/**
 * Consistent JSON response shape for all API routes.
 *
 * Success bodies are returned as-is from the route handler. Error bodies
 * always look like `{ error: { code, message } }` — see `ApiErrorBody` below.
 */
import { NextResponse } from 'next/server'
import { AuthError, isAuthError } from '@/lib/auth/verifyRequest'

export interface ApiErrorBody {
  error: { code: string; message: string }
}

export function jsonOk<T>(data: T, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(data, { status: 200, ...init })
}

export function jsonError(status: number, code: string, message: string): NextResponse {
  const body: ApiErrorBody = { error: { code, message } }
  return NextResponse.json(body, { status })
}

/**
 * Map common thrown errors to the standard error response shape. Use at the
 * top of a route's try/catch so handler code can throw and stay readable.
 */
export function errorToResponse(err: unknown): NextResponse {
  if (isAuthError(err)) {
    return jsonError(err.status, err.code, err.message)
  }
  if (err instanceof AuthError) {
    return jsonError(err.status, err.code, err.message)
  }
  if (err instanceof Error) {
    return jsonError(500, 'internal_error', err.message)
  }
  return jsonError(500, 'internal_error', 'Unknown error')
}
