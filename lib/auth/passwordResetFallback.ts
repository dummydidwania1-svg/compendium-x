type ForgotPasswordApiResponse =
  | { ok: true }
  | { ok: false; error?: { message?: string; code?: string } }

function passwordResetErrorFromCode(code: string | undefined): Error {
  switch (code) {
    case 'EMAIL_NOT_FOUND':
      return new Error('auth/user-not-found')
    case 'INVALID_EMAIL':
      return new Error('auth/invalid-email')
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return new Error('auth/too-many-requests')
    case 'network-request-failed':
      return new Error('auth/network-request-failed')
    default:
      return new Error('Unable to send reset email.')
  }
}

export async function requestPasswordResetFallback(email: string): Promise<void> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 15000)

  let response: Response
  let payload: ForgotPasswordApiResponse

  try {
    response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })

    payload = (await response.json()) as ForgotPasswordApiResponse
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('auth/network-request-failed')
    }
    throw new Error('auth/network-request-failed')
  } finally {
    globalThis.clearTimeout(timeout)
  }

  if (!response.ok || !payload.ok) {
    throw passwordResetErrorFromCode(payload.ok ? undefined : payload.error?.code)
  }
}
