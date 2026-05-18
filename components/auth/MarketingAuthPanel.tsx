'use client'

import { type CSSProperties, type FormEvent, useState } from 'react'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { auth, db, missingFirebaseClientConfig } from '@/lib/firebase/config'
import { getPostAuthRoute } from '@/lib/auth/postAuth'
import { authenticateWithPasswordFallback } from '@/lib/auth/passwordFallback'

export type AuthMode = 'signin' | 'signup'

type MarketingAuthPanelProps = {
  redirectTarget: string
  currentPath?: string
  initialMode?: AuthMode
  onClose: () => void
  onSuccess?: () => void
}

const AUTH_FALLBACK_PREFERENCE_KEY = 'compendiumx-prefer-auth-fallback'

// Field styling lives in the <style> block below with !important rather than
// here as inline style. Browser extensions that hijack the email input (Temp
// Mail, certain password managers, Google Tag Manager interaction trackers)
// rewrite inline `style` attributes on the input element after React mounts —
// effectively stripping our border/background/padding to nothing and leaving
// users staring at an invisible field. !important class-level rules beat
// non-important inline styles (including those injected by extensions), so
// the visible affordance survives. This empty object is kept only so the
// existing `style={INPUT_STYLE}` JSX attributes stay legal during the
// migration; everything that matters now lives in `.marketing-auth-field`.
const INPUT_STYLE: CSSProperties = {}

const FIELD_WRAPPER_STYLE: CSSProperties = {
  position: 'relative',
  width: '100%',
  minHeight: '48px',
  marginBottom: '16px',
  overflow: 'hidden',
}

export default function MarketingAuthPanel({
  redirectTarget,
  currentPath,
  initialMode = 'signin',
  onClose,
  onSuccess,
}: MarketingAuthPanelProps) {
  const router = useRouter()

  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'error' | 'info'>('error')

  const isSignUp = mode === 'signup'

  const shouldPreferFallback = () => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(AUTH_FALLBACK_PREFERENCE_KEY) === '1'
  }

  const setPreferFallback = (enabled: boolean) => {
    if (typeof window === 'undefined') return
    if (enabled) {
      window.localStorage.setItem(AUTH_FALLBACK_PREFERENCE_KEY, '1')
    } else {
      window.localStorage.removeItem(AUTH_FALLBACK_PREFERENCE_KEY)
    }
  }

  const toFriendlyMessage = (error: unknown, fallback: string): string => {
    if (!(error instanceof Error)) return fallback
    if (error.message.includes('auth/network-request-failed')) {
      if (missingFirebaseClientConfig.length > 0) {
        return 'Firebase web config is missing in this client build. Restart the dev server after updating .env.local and try again.'
      }

      return 'Direct Firebase auth is being blocked in this browser. A fallback path should have been attempted automatically. If this message still appears, restart the dev server and retry.'
    }
    if (error.message.includes('auth/invalid-credential')) return 'Invalid email or password.'
    if (error.message.includes('auth/user-not-found')) return 'No account found for this email.'
    if (error.message.includes('auth/email-already-in-use')) {
      return 'This email is already registered. Please sign in.'
    }
    if (error.message.includes('auth/weak-password')) {
      return 'Use a stronger password (at least 6 characters).'
    }
    if (error.message.includes('auth/too-many-requests')) {
      return 'Too many attempts. Please wait a bit and try again.'
    }
    return error.message
  }

  const validateForm = (): string | null => {
    const trimmedEmail = email.trim()

    if (isSignUp && !fullName.trim()) return 'Enter your full name.'
    if (!trimmedEmail) return 'Enter your email.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) return 'Enter a valid email.'
    if (!password) return 'Enter your password.'
    if (password.length < 6) return 'Password must be at least 6 characters.'
    if (isSignUp && confirmPassword !== password) return 'Passwords do not match.'

    return null
  }

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode)
    setMessage('')
    setMessageTone('error')
  }

  const finishAuth = async (uid: string) => {
    onSuccess?.()

    const nextRoute = await getPostAuthRoute(uid, redirectTarget, {
      fallbackRoute: isSignUp
        ? `/onboarding?redirect=${encodeURIComponent(redirectTarget)}`
        : redirectTarget,
    })

    if (currentPath && nextRoute === currentPath) {
      router.refresh()
      return
    }

    router.push(nextRoute)
    router.refresh()
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setMessage(validationError)
      setMessageTone('error')
      return
    }

    if (missingFirebaseClientConfig.length > 0) {
      setMessage(
        'Firebase web config is missing in this client build. Restart the dev server after updating .env.local and try again.'
      )
      setMessageTone('error')
      return
    }

    setLoading(true)
    setMessage('')
    setMessageTone('error')

    try {
      const normalizedEmail = email.trim().toLowerCase()
      let credential: { user: { uid: string } }
      const preferFallback = shouldPreferFallback()

      if (preferFallback) {
        credential = await authenticateWithPasswordFallback(
          isSignUp ? 'signup' : 'signin',
          normalizedEmail,
          password
        )
      } else {
        try {
          credential = isSignUp
            ? await createUserWithEmailAndPassword(auth, normalizedEmail, password)
            : await signInWithEmailAndPassword(auth, normalizedEmail, password)
          setPreferFallback(false)
        } catch (error) {
          if (error instanceof Error && error.message.includes('auth/network-request-failed')) {
            setPreferFallback(true)
            credential = await authenticateWithPasswordFallback(
              isSignUp ? 'signup' : 'signin',
              normalizedEmail,
              password
            )
          } else {
            throw error
          }
        }
      }

      if (isSignUp && fullName.trim()) {
        try {
          await setDoc(
            doc(db, 'profiles', credential.user.uid),
            {
              fullName: fullName.trim(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          )
        } catch {
          // If profile prefill fails, onboarding will collect it next.
        }

        setMessage('Account created. Redirecting to complete your profile...')
        setMessageTone('info')
      }

      await finishAuth(credential.user.uid)
    } catch (error) {
      console.error('Marketing auth failed', error)
      setMessage(
        toFriendlyMessage(error, isSignUp ? 'Unable to create account.' : 'Unable to sign in.')
      )
      setMessageTone('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative"
      style={{
        background: '#fff8f0',
        border: '1px solid rgba(61,90,53,0.1)',
        padding: '40px',
        width: '400px',
        maxWidth: '90vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}
    >
      <style>{`
        .marketing-auth-form {
          position: relative;
        }
        .marketing-auth-input-wrap {
          position: relative;
          width: 100%;
          min-height: 48px;
          margin-bottom: 16px;
          overflow: hidden;
        }
        .marketing-auth-input-wrap > :not(.marketing-auth-field) {
          display: none !important;
        }
        /* All visible styling on the input lives here with !important so
         * inline overrides injected by browser extensions (Temp Mail,
         * password helpers, GTM trackers) can't strip the affordance away.
         * Inline-style writes from extensions lose against !important
         * class-level rules in the cascade. */
        .marketing-auth-field {
          display: block !important;
          width: 100% !important;
          height: 48px !important;
          padding: 12px 16px !important;
          border: 1px solid #c3c8bd !important;
          background: #faf3e9 !important;
          font-family: 'Work Sans', sans-serif !important;
          font-size: 14px !important;
          line-height: 20px !important;
          color: #1e1b15 !important;
          outline: none !important;
          box-sizing: border-box !important;
          border-radius: 0 !important;
          -webkit-appearance: none !important;
          appearance: none !important;
          position: relative !important;
          z-index: 2 !important;
          transition: border-color 0.2s !important;
        }
        .marketing-auth-field:focus {
          border-color: #3D5A35 !important;
        }
        .marketing-auth-field::placeholder {
          color: #9b8f81;
          opacity: 1;
        }
        .marketing-auth-field::-webkit-contacts-auto-fill-button,
        .marketing-auth-field::-webkit-credentials-auto-fill-button,
        .marketing-auth-field::-webkit-clear-button,
        .marketing-auth-field::-webkit-calendar-picker-indicator,
        .marketing-auth-field::-webkit-inner-spin-button {
          display: none !important;
          -webkit-appearance: none;
          opacity: 0;
          margin: 0;
          pointer-events: none;
        }
        .marketing-auth-field::-ms-reveal,
        .marketing-auth-field::-ms-clear {
          display: none;
        }
        .marketing-auth-field:-webkit-autofill,
        .marketing-auth-field:-webkit-autofill:hover,
        .marketing-auth-field:-webkit-autofill:focus,
        .marketing-auth-field:-webkit-autofill:active {
          -webkit-text-fill-color: #1e1b15;
          box-shadow: 0 0 0 1000px #faf3e9 inset !important;
          transition: background-color 9999s ease-in-out 0s;
          caret-color: #1e1b15;
        }
      `}</style>

      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-[#73796f] text-2xl leading-none bg-transparent border-none cursor-pointer"
        aria-label="Close"
      >
        &times;
      </button>

      <h1
        style={{
          fontFamily: "'Newsreader', serif",
          fontSize: '1.75rem',
          color: '#453a2a',
          marginBottom: '24px',
        }}
      >
        {isSignUp ? 'Create Account' : 'Sign In'}
      </h1>

      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        className="marketing-auth-form"
      >
        {isSignUp ? (
          <div className="marketing-auth-input-wrap" style={FIELD_WRAPPER_STYLE}>
            <input
              className="marketing-auth-field"
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              style={INPUT_STYLE}
            />
          </div>
        ) : null}

        <div className="marketing-auth-input-wrap" style={FIELD_WRAPPER_STYLE}>
          <input
            className="marketing-auth-field"
            type="text"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            style={INPUT_STYLE}
          />
        </div>

        <div className="marketing-auth-input-wrap" style={FIELD_WRAPPER_STYLE}>
          <input
            className="marketing-auth-field"
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            style={INPUT_STYLE}
          />
        </div>

        {isSignUp ? (
          <div className="marketing-auth-input-wrap" style={FIELD_WRAPPER_STYLE}>
            <input
              className="marketing-auth-field"
              type="password"
              placeholder="Confirm Password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              style={INPUT_STYLE}
            />
          </div>
        ) : null}

        {message ? (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 14px',
              border: `1px solid ${
                messageTone === 'error' ? 'rgba(146, 64, 14, 0.18)' : 'rgba(61, 90, 53, 0.18)'
              }`,
              background:
                messageTone === 'error' ? 'rgba(146, 64, 14, 0.05)' : 'rgba(61, 90, 53, 0.05)',
              color: messageTone === 'error' ? '#92400e' : '#3D5A35',
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            background: '#3D5A35',
            color: '#fff',
            fontFamily: "'Work Sans', sans-serif",
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            marginTop: '8px',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Please Wait...' : isSignUp ? 'Create Account' : 'Sign In'}
        </button>
      </form>

      <div
        style={{
          marginTop: '16px',
          textAlign: 'center',
          fontFamily: "'Work Sans', sans-serif",
          fontSize: '13px',
          color: '#73796f',
        }}
      >
        {isSignUp ? (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => handleModeChange('signin')}
              style={{
                color: '#3D5A35',
                cursor: 'pointer',
                textDecoration: 'underline',
                background: 'none',
                border: 'none',
                fontFamily: "'Work Sans', sans-serif",
                fontSize: '13px',
              }}
            >
              Sign In
            </button>
          </>
        ) : (
          <>
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => handleModeChange('signup')}
              style={{
                color: '#3D5A35',
                cursor: 'pointer',
                textDecoration: 'underline',
                background: 'none',
                border: 'none',
                fontFamily: "'Work Sans', sans-serif",
                fontSize: '13px',
              }}
            >
              Create Account
            </button>
          </>
        )}
      </div>
    </div>
  )
}
