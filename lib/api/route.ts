/**
 * `authenticatedRoute(routeName, handler)` — a higher-order function that
 * wraps a Next.js route handler with:
 *   - Bearer-token auth (via `verifyRequest`)
 *   - Standardized error → response mapping
 *   - Structured request logging
 *
 * The wrapped handler receives the verified caller and resolved route params.
 * Throw `AuthError`, `BodyError`, or `TransitionError` from inside and they
 * map to the right HTTP status + JSON shape automatically.
 */
import 'server-only'
import type { NextResponse } from 'next/server'
import { AuthError, verifyRequest, type VerifiedCaller } from '@/lib/auth/verifyRequest'
import { BodyError, TransitionError, errorToResponse } from './responses'
import { logRequest } from './logger'

interface NextRouteContext<P> {
  params: Promise<P>
}

type AuthenticatedHandler<P> = (
  request: Request,
  caller: VerifiedCaller,
  params: P,
) => Promise<NextResponse>

export function authenticatedRoute<P extends Record<string, string> = Record<string, never>>(
  routeName: string,
  handler: AuthenticatedHandler<P>,
) {
  return async (
    request: Request,
    ctx: NextRouteContext<P> = { params: Promise.resolve({} as P) },
  ): Promise<NextResponse> => {
    const start = Date.now()
    let uid: string | null = null
    let response: NextResponse
    let errorMessage: string | undefined
    let errorCode: string | undefined

    try {
      const caller = await verifyRequest(request)
      uid = caller.uid
      const params = await ctx.params
      response = await handler(request, caller, params)
    } catch (err) {
      response = errorToResponse(err)
      if (err instanceof Error) {
        errorMessage = err.message
      }
      if (
        err instanceof AuthError ||
        err instanceof BodyError ||
        err instanceof TransitionError
      ) {
        errorCode = err.code
      }
    }

    logRequest({
      route: routeName,
      method: request.method,
      status: response.status,
      durationMs: Date.now() - start,
      uid,
      errorCode,
      errorMessage,
    })

    return response
  }
}
