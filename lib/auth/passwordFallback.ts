import { UserImpl } from '@firebase/auth/internal'
import { auth } from '@/lib/firebase/config'

export type PasswordAuthMode = 'signin' | 'signup'

type PasswordCredentialPayload = {
  idToken: string
  refreshToken: string
  expiresIn: string
  localId: string
  email: string
  displayName: string | null
}

type PasswordAuthApiSuccess = {
  ok: true
  credential: PasswordCredentialPayload
}

type PasswordAuthApiFailure = {
  ok: false
  error?: {
    message?: string
    code?: string
  }
}

type PasswordAuthApiResponse = PasswordAuthApiSuccess | PasswordAuthApiFailure

function passwordAuthErrorFromCode(code: string | undefined, mode: PasswordAuthMode): Error {
  switch (code) {
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_PASSWORD':
    case 'INVALID_LOGIN_CREDENTIALS':
      return new Error('auth/invalid-credential')
    case 'EMAIL_EXISTS':
      return new Error('auth/email-already-in-use')
    case 'WEAK_PASSWORD':
      return new Error('auth/weak-password')
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return new Error('auth/too-many-requests')
    case 'network-request-failed':
      return new Error('auth/network-request-failed')
    default:
      return new Error(mode === 'signup' ? 'Unable to create account.' : 'Unable to sign in.')
  }
}

export async function authenticateWithPasswordFallback(
  mode: PasswordAuthMode,
  email: string,
  password: string
): Promise<{ user: { uid: string } }> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 15000)

  let response: Response
  let payload: PasswordAuthApiResponse

  try {
    response = await fetch('/api/auth/password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode,
        email,
        password,
      }),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })

    payload = (await response.json()) as PasswordAuthApiResponse
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('auth/network-request-failed')
    }
    throw new Error('auth/network-request-failed')
  } finally {
    globalThis.clearTimeout(timeout)
  }

  if (!response.ok || !payload.ok) {
    throw passwordAuthErrorFromCode(payload.ok ? undefined : payload.error?.code, mode)
  }

  const credential = payload.credential
  const expirationTime = Date.now() + Number(credential.expiresIn || '3600') * 1000

  const hydratedUser = UserImpl._fromJSON(auth as never, {
    uid: credential.localId,
    email: credential.email,
    emailVerified: false,
    displayName: credential.displayName ?? null,
    isAnonymous: false,
    providerData: [
      {
        providerId: 'password',
        uid: credential.email,
        displayName: credential.displayName ?? null,
        email: credential.email,
        phoneNumber: null,
        photoURL: null,
      },
    ],
    stsTokenManager: {
      accessToken: credential.idToken,
      refreshToken: credential.refreshToken,
      expirationTime,
    },
  } as never)

  await (auth as never as { _updateCurrentUser: (user: unknown) => Promise<void> })._updateCurrentUser(
    hydratedUser
  )

  return {
    user: {
      uid: credential.localId,
    },
  }
}
