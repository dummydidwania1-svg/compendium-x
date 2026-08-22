/**
 * Consistent JSON response shape for all API routes.
 *
 * Success bodies are returned as-is from the route handler. Error bodies
 * always look like `{ error: { code, message } }` — see `ApiErrorBody` below.
 */
import { NextResponse } from 'next/server'
import type { ZodType } from 'zod'
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
 * Thrown by `parseBody` when the request body is missing, malformed, or fails
 * the supplied schema. Route handlers should catch via `errorToResponse`.
 */
export class BodyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'BodyError'
  }
}

/**
 * Thrown inside a Firestore transaction when the requested state change is
 * forbidden by the session/evaluation state machine.
 * Route handlers should catch via `errorToResponse`.
 */
export class TransitionError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TransitionError'
  }
}

/**
 * Parse JSON body of a request and validate against the provided Zod schema.
 * Throws `BodyError` on invalid JSON or schema mismatch.
 */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new BodyError(400, 'invalid_json', 'Request body must be valid JSON.')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    const path = first?.path?.join('.') || '(root)'
    throw new BodyError(400, 'invalid_payload', `${path}: ${first?.message ?? 'Invalid payload'}`)
  }
  return result.data
}

/**
 * Map common thrown errors to the standard error response shape. Use at the
 * top of a route's try/catch so handler code can throw and stay readable.
 */
export function errorToResponse(err: unknown): NextResponse {
  if (isAuthError(err) || err instanceof AuthError) {
    return jsonError(err.status, err.code, err.message)
  }
  if (err instanceof BodyError || err instanceof TransitionError) {
    return jsonError(err.status, err.code, err.message)
  }
  if (err instanceof Error) {
    // Unexpected errors: never echo internal messages (Firestore/gRPC details,
    // driver internals) to the client. The structured request logger already
    // captures the full error server-side.
    return jsonError(500, 'internal_error', 'Something went wrong on our end. Please try again.')
  }
  return jsonError(500, 'internal_error', 'Something went wrong on our end. Please try again.')
}
