import { NextResponse } from 'next/server'

type PasswordAuthMode = 'signin' | 'signup'

type PasswordAuthRequest = {
  mode?: PasswordAuthMode
  email?: string
  password?: string
}

type FirebasePasswordAuthSuccess = {
  idToken?: string
  refreshToken?: string
  expiresIn?: string
  localId?: string
  email?: string
  displayName?: string
}

type FirebasePasswordAuthFailure = {
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

function isFirebasePasswordAuthSuccess(
  payload: FirebasePasswordAuthSuccess | FirebasePasswordAuthFailure
): payload is FirebasePasswordAuthSuccess {
  return (
    'idToken' in payload ||
    'refreshToken' in payload ||
    'localId' in payload ||
    'expiresIn' in payload
  )
}

export async function POST(request: Request) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()

  if (!apiKey) {
    return jsonError('Firebase API key is not configured on the server.', 500, 'missing-api-key')
  }

  let body: PasswordAuthRequest

  try {
    body = (await request.json()) as PasswordAuthRequest
  } catch {
    return jsonError('Invalid request body.', 400, 'invalid-json')
  }

  const mode = body.mode === 'signup' ? 'signup' : body.mode === 'signin' ? 'signin' : null
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!mode) return jsonError('Invalid auth mode.', 400, 'invalid-mode')
  if (!email) return jsonError('Email is required.', 400, 'missing-email')
  if (!password) return jsonError('Password is required.', 400, 'missing-password')

  const endpoint =
    mode === 'signup'
      ? `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`
      : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`

  try {
    const firebaseResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
      cache: 'no-store',
    })

    const payload = (await firebaseResponse.json()) as
      | FirebasePasswordAuthSuccess
      | FirebasePasswordAuthFailure

    if (!firebaseResponse.ok) {
      const code = 'error' in payload ? payload.error?.message : undefined
      return jsonError('Firebase password auth failed.', firebaseResponse.status, code)
    }

    if (!isFirebasePasswordAuthSuccess(payload)) {
      return jsonError('Firebase password auth returned an unexpected response.', 502, 'invalid-response')
    }

    return NextResponse.json({
      ok: true,
      credential: {
        idToken: payload.idToken,
        refreshToken: payload.refreshToken,
        expiresIn: payload.expiresIn,
        localId: payload.localId,
        email: payload.email,
        displayName: payload.displayName ?? null,
      },
    })
  } catch {
    return jsonError('Unable to reach Firebase auth service.', 502, 'network-request-failed')
  }
}
