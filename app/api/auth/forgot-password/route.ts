import { NextResponse } from 'next/server'

type ForgotPasswordRequest = {
  email?: string
}

type FirebaseSendOobFailure = {
  error?: {
    message?: string
  }
}

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        message,
        code,
      },
    },
    { status }
  )
}

export async function POST(request: Request) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()

  if (!apiKey) {
    return jsonError('Firebase API key is not configured on the server.', 500, 'missing-api-key')
  }

  let body: ForgotPasswordRequest

  try {
    body = (await request.json()) as ForgotPasswordRequest
  } catch {
    return jsonError('Invalid request body.', 400, 'invalid-json')
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) return jsonError('Email is required.', 400, 'missing-email')

  try {
    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email,
        }),
        cache: 'no-store',
      }
    )

    const payload = (await firebaseResponse.json()) as FirebaseSendOobFailure

    if (!firebaseResponse.ok) {
      const code = payload.error?.message
      // EMAIL_NOT_FOUND is treated as success by the caller (no account
      // enumeration), so pass the code through rather than erroring here.
      return jsonError('Firebase password reset failed.', firebaseResponse.status, code)
    }

    return NextResponse.json({ ok: true })
  } catch {
    return jsonError('Unable to reach Firebase auth service.', 502, 'network-request-failed')
  }
}
