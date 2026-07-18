'use client'

import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'
import { auth, db, missingFirebaseClientConfig } from '@/lib/firebase/config'
import { getPostAuthRoute } from '@/lib/auth/postAuth'
import { authenticateWithPasswordFallback } from '@/lib/auth/passwordFallback'
import { requestPasswordResetFallback } from '@/lib/auth/passwordResetFallback'
import { triggerOnboardingEmail, triggerVerificationEmail } from '@/lib/auth/accountEmails'
import { consumeGoogleRedirectResult, signInWithGoogle } from '@/lib/auth/googleSignIn'

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

const PANEL_STYLE: CSSProperties = {
  background: '#fff8f0',
  border: '1px solid rgba(61,90,53,0.1)',
  padding: '40px',
  width: '400px',
  maxWidth: '90vw',
  boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
}

const PANEL_STYLES = `
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
  .marketing-google-btn {
    width: 100%;
    padding: 13px 16px;
    background: #faf3e9;
    color: #453a2a;
    font-family: 'Work Sans', sans-serif;
    font-size: 13px;
    border: 1px solid #c3c8bd;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 20px;
    transition: border-color 0.2s, background 0.15s;
    letter-spacing: 0.01em;
    box-sizing: border-box;
  }
  .marketing-google-btn:hover:not(:disabled) {
    border-color: #3D5A35;
    background: #f5eedd;
  }
  .marketing-google-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
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
  const [college, setCollege] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'error' | 'info'>('error')
  const [verificationSent, setVerificationSent] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')

  // Google sign-in only collects a display name from the OAuth profile — college
  // still needs to be collected. Rather than routing to the separate /onboarding
  // page, we swap this same panel's content in place so no new screen appears.
  const [needsCollege, setNeedsCollege] = useState(false)
  const [collegeUid, setCollegeUid] = useState<string | null>(null)
  const [collegeValue, setCollegeValue] = useState('')
  const [collegeLoading, setCollegeLoading] = useState(false)
  const [collegeError, setCollegeError] = useState('')

  // Forgot password — same panel, swapped content, same as the college step above.
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

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
        return "We're having trouble connecting right now. Please try again in a moment."
      }
      return 'Sign-in was blocked, possibly by an ad blocker or privacy extension. Try disabling it for this site, or use a different browser, then try again.'
    }
    if (error.message.includes('auth/invalid-credential')) return 'Invalid email or password.'
    if (error.message.includes('auth/invalid-email')) return 'Enter a valid email.'
    if (error.message.includes('auth/user-not-found')) return 'No account found for this email.'
    if (error.message.includes('auth/user-disabled')) return 'This account has been deactivated.'
    if (error.message.includes('auth/email-already-in-use')) {
      return 'This email is already registered. Please sign in.'
    }
    if (error.message.includes('auth/weak-password')) {
      return 'Use a stronger password (at least 6 characters).'
    }
    if (error.message.includes('auth/too-many-requests')) {
      return 'Too many attempts. Please wait a bit and try again.'
    }
    if (error.message.includes('auth/popup-blocked')) {
      return 'Pop-up blocked by your browser. Please allow pop-ups for this site and try again.'
    }
    if (error.message.includes('auth/popup-timeout')) {
      return "Google sign-in is taking too long in this browser. We've switched to a different method — please try again."
    }
    return error.message
  }

  const validateForm = (): string | null => {
    const trimmedEmail = email.trim()
    if (isSignUp && !fullName.trim()) return 'Enter your full name.'
    if (isSignUp && !college.trim()) return 'Enter your university or college.'
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
    setVerificationSent(false)
    setVerificationEmail('')
    setCollege('')
  }

  const finishAuth = async (uid: string, newUser = false) => {
    onSuccess?.()
    const nextRoute = await getPostAuthRoute(uid, redirectTarget, {
      fallbackRoute: newUser
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

  // Shared by both the popup path (resolves inline) and the redirect
  // fallback's return trip (resolves on the next mount, via the effect
  // below) — same profile-prefill / college-check / finishAuth sequence
  // either way, so a user who got bounced to the redirect flow because
  // their browser was hostile to popups sees the exact same result.
  const completeGoogleSignIn = async (user: User) => {
    if (user.displayName) {
      try {
        await setDoc(
          doc(db, 'profiles', user.uid),
          { fullName: user.displayName, updatedAt: serverTimestamp() },
          { merge: true }
        )
      } catch {
        // profile prefill failure — onboarding will collect it
      }
    }

    try {
      const profileSnapshot = await getDoc(doc(db, 'profiles', user.uid))
      const existingUniversity = profileSnapshot.exists() ? profileSnapshot.data()?.university : null
      const hasUniversity =
        typeof existingUniversity === 'string' && existingUniversity.trim().length > 0

      if (!hasUniversity) {
        setCollegeUid(user.uid)
        setNeedsCollege(true)
        setGoogleLoading(false)
        return
      }
    } catch {
      // If this check fails, finishAuth's own getPostAuthRoute call below
      // still safely falls back to /onboarding if college is missing.
    }

    await finishAuth(user.uid, true)
  }

  // Catches the return trip when signInWithGoogle() fell back to a full-page
  // redirect (popup blocked/timed out/cancelled) — that navigation interrupts
  // handleGoogleSignIn below before it can finish, so the flow has to resume
  // here on the next mount instead. No-ops on every normal page load where
  // there's no pending redirect result.
  const redirectCheckStarted = useRef(false)
  useEffect(() => {
    if (redirectCheckStarted.current) return
    redirectCheckStarted.current = true
    consumeGoogleRedirectResult().then((user) => {
      if (!user) return
      setGoogleLoading(true)
      completeGoogleSignIn(user).catch((error) => {
        setMessage(toFriendlyMessage(error, 'Unable to sign in with Google.'))
        setMessageTone('error')
        setGoogleLoading(false)
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGoogleSignIn = async () => {
    if (missingFirebaseClientConfig.length > 0) {
      setMessage(
        "We're having trouble connecting right now. Please try again in a moment."
      )
      setMessageTone('error')
      return
    }

    setGoogleLoading(true)
    setMessage('')
    setMessageTone('error')

    try {
      const user = await signInWithGoogle()
      await completeGoogleSignIn(user)
    } catch (error) {
      // User dismissed the popup — no message needed
      if (error instanceof Error && error.message.includes('auth/popup-closed-by-user')) {
        return
      }
      setMessage(toFriendlyMessage(error, 'Unable to sign in with Google.'))
      setMessageTone('error')
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleCollegeSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!collegeUid) return
    const trimmed = collegeValue.trim()
    if (!trimmed) {
      setCollegeError('Enter your university or college.')
      return
    }

    setCollegeLoading(true)
    setCollegeError('')
    try {
      await setDoc(
        doc(db, 'profiles', collegeUid),
        { university: trimmed, updatedAt: serverTimestamp() },
        { merge: true }
      )
      onSuccess?.()
      if (currentPath && redirectTarget === currentPath) {
        router.refresh()
      } else {
        router.push(redirectTarget)
        router.refresh()
      }
    } catch (error) {
      setCollegeError(
        error instanceof Error ? error.message : 'Unable to save your college right now.'
      )
    } finally {
      setCollegeLoading(false)
    }
  }

  const openForgotPassword = () => {
    setResetEmail(email.trim())
    setResetError('')
    setResetSent(false)
    setShowForgotPassword(true)
  }

  const closeForgotPassword = () => {
    setShowForgotPassword(false)
    setResetSent(false)
    setResetError('')
  }

  const handleForgotPasswordSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedEmail = resetEmail.trim()
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setResetError('Enter a valid email.')
      return
    }

    if (missingFirebaseClientConfig.length > 0) {
      setResetError(
        "We're having trouble connecting right now. Please try again in a moment."
      )
      return
    }

    setResetLoading(true)
    setResetError('')

    try {
      if (shouldPreferFallback()) {
        await requestPasswordResetFallback(trimmedEmail)
      } else {
        try {
          await sendPasswordResetEmail(auth, trimmedEmail)
        } catch (error) {
          if (error instanceof Error && error.message.includes('auth/network-request-failed')) {
            setPreferFallback(true)
            await requestPasswordResetFallback(trimmedEmail)
          } else {
            throw error
          }
        }
      }
      setResetSent(true)
    } catch (error) {
      // Treat "no account for this email" as success too — showing the same
      // generic confirmation either way avoids leaking which emails are registered.
      if (error instanceof Error && error.message.includes('auth/user-not-found')) {
        setResetSent(true)
        return
      }
      setResetError(toFriendlyMessage(error, 'Unable to send reset email. Try again.'))
    } finally {
      setResetLoading(false)
    }
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
        "We're having trouble connecting right now. Please try again in a moment."
      )
      setMessageTone('error')
      return
    }

    setLoading(true)
    setMessage('')
    setMessageTone('error')

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const preferFallback = shouldPreferFallback()

      if (isSignUp) {
        if (preferFallback) {
          // Fallback signup: verification email not possible via REST path; proceed to onboarding
          const credential = await authenticateWithPasswordFallback('signup', normalizedEmail, password)
          if (fullName.trim()) {
            try {
              await setDoc(
                doc(db, 'profiles', credential.user.uid),
                { fullName: fullName.trim(), university: college.trim(), updatedAt: serverTimestamp() },
                { merge: true }
              )
            } catch {
              // onboarding will collect it
            }
          }
          setMessage('Account created. Redirecting...')
          setMessageTone('info')
          await finishAuth(credential.user.uid, true)
          return
        }

        try {
          const result = await createUserWithEmailAndPassword(auth, normalizedEmail, password)
          setPreferFallback(false)

          if (fullName.trim()) {
            try {
              await setDoc(
                doc(db, 'profiles', result.user.uid),
                { fullName: fullName.trim(), university: college.trim(), updatedAt: serverTimestamp() },
                { merge: true }
              )
            } catch {
              // onboarding will collect it
            }
          }

          await signOut(auth)
          setVerificationEmail(normalizedEmail)
          setVerificationSent(true)
          return
        } catch (error) {
          if (error instanceof Error && error.message.includes('auth/network-request-failed')) {
            setPreferFallback(true)
            const credential = await authenticateWithPasswordFallback('signup', normalizedEmail, password)
            if (fullName.trim()) {
              try {
                await setDoc(
                  doc(db, 'profiles', credential.user.uid),
                  { fullName: fullName.trim(), university: college.trim(), updatedAt: serverTimestamp() },
                  { merge: true }
                )
              } catch {
                // onboarding will collect it
              }
            }
            setMessage('Account created. Redirecting...')
            setMessageTone('info')
            await finishAuth(credential.user.uid, true)
            return
          }
          throw error
        }
      } else {
        // Sign in
        if (preferFallback) {
          // Fallback path: can't check emailVerified reliably, proceed
          const credential = await authenticateWithPasswordFallback('signin', normalizedEmail, password)
          await finishAuth(credential.user.uid)
          return
        }

        try {
          const result = await signInWithEmailAndPassword(auth, normalizedEmail, password)

          // Refresh from the server before reading emailVerified. Right after a
          // user clicks the verification link, the value cached on the User can
          // be stale in EITHER direction — reload() makes it authoritative, so
          // we don't (a) block a just-verified user, or (b) fire the onboarding
          // email while the backend still considers them unverified (which
          // makes the onboarding callable no-op on its server-side check).
          try {
            await result.user.reload()
          } catch {
            // Non-fatal — fall back to whatever the sign-in token carried.
          }

          // Accounts with Google already linked are inherently verified —
          // Google vouched for the email before the password was ever added
          // (e.g. via "Set Password" in Account). Never re-gate those on
          // emailVerified, which can also read stale immediately after a
          // linkWithCredential() call due to backend replication lag.
          const hasGoogleProvider = result.user.providerData.some((p) => p.providerId === 'google.com')

          if (!result.user.emailVerified && !hasGoogleProvider) {
            // Resend verification and block sign-in. Prefer the custom-template
            // email (via the callable, using the now-signed-in user's token);
            // fall back to Firebase's default email if the callable fails, so
            // the user is never left without a way to verify.
            try {
              await triggerVerificationEmail()
            } catch {
              await sendEmailVerification(result.user)
            }
            await signOut(auth)
            setVerificationEmail(normalizedEmail)
            setVerificationSent(true)
            return
          }

          setPreferFallback(false)
          // Verified email/password sign-in — send the onboarding email once
          // (post-verification). Idempotent server-side, and skipped for
          // Google-linked accounts, which already got onboarding at signup.
          if (!hasGoogleProvider) {
            void triggerOnboardingEmail().catch(() => {})
          }
          await finishAuth(result.user.uid)
          return
        } catch (error) {
          if (error instanceof Error && error.message.includes('auth/network-request-failed')) {
            setPreferFallback(true)
            const credential = await authenticateWithPasswordFallback('signin', normalizedEmail, password)
            await finishAuth(credential.user.uid)
            return
          }
          throw error
        }
      }
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

  // --- Forgot password (same panel, swapped content) ---
  if (showForgotPassword) {
    if (resetSent) {
      return (
        <div className="relative" style={PANEL_STYLE}>
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
              marginBottom: '12px',
            }}
          >
            Check your inbox
          </h1>

          <p
            style={{
              fontFamily: "'Work Sans', sans-serif",
              fontSize: '14px',
              color: '#73796f',
              lineHeight: 1.6,
              marginBottom: '28px',
            }}
          >
            If an account exists for{' '}
            <strong style={{ color: '#453a2a' }}>{resetEmail.trim()}</strong>, we&apos;ve sent a
            link to reset the password. Click it, choose a new password, then come back and sign in.
          </p>

          <button
            type="button"
            onClick={closeForgotPassword}
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
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            Back to Sign In
          </button>
        </div>
      )
    }

    return (
      <div className="relative" style={PANEL_STYLE}>
        <style>{PANEL_STYLES}</style>

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
            marginBottom: '12px',
          }}
        >
          Reset your password
        </h1>

        <p
          style={{
            fontFamily: "'Work Sans', sans-serif",
            fontSize: '14px',
            color: '#73796f',
            lineHeight: 1.6,
            marginBottom: '20px',
          }}
        >
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        <form
          onSubmit={handleForgotPasswordSubmit}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          className="marketing-auth-form"
        >
          <div className="marketing-auth-input-wrap" style={FIELD_WRAPPER_STYLE}>
            <input
              className="marketing-auth-field"
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Email"
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              autoComplete="off"
              autoFocus
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              style={INPUT_STYLE}
            />
          </div>

          {resetError ? (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 14px',
                border: '1px solid rgba(146, 64, 14, 0.18)',
                background: 'rgba(146, 64, 14, 0.05)',
                color: '#92400e',
                fontSize: '13px',
                lineHeight: 1.5,
              }}
            >
              {resetError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={resetLoading}
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
              cursor: resetLoading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              opacity: resetLoading ? 0.7 : 1,
            }}
          >
            {resetLoading ? 'Sending...' : 'Send Reset Link'}
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
          <button
            type="button"
            onClick={closeForgotPassword}
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
            Back to Sign In
          </button>
        </div>
      </div>
    )
  }

  // --- College step (Google sign-in only; same panel, no separate screen) ---
  if (needsCollege) {
    return (
      <div className="relative" style={PANEL_STYLE}>
        <style>{PANEL_STYLES}</style>

        <h1
          style={{
            fontFamily: "'Newsreader', serif",
            fontSize: '1.75rem',
            color: '#453a2a',
            marginBottom: '12px',
          }}
        >
          One last step
        </h1>

        <p
          style={{
            fontFamily: "'Work Sans', sans-serif",
            fontSize: '14px',
            color: '#73796f',
            lineHeight: 1.6,
            marginBottom: '20px',
          }}
        >
          Add your university or college so your dashboard and feedback history stay personalized.
        </p>

        <form
          onSubmit={handleCollegeSubmit}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          className="marketing-auth-form"
        >
          <div className="marketing-auth-input-wrap" style={FIELD_WRAPPER_STYLE}>
            <input
              className="marketing-auth-field"
              type="text"
              placeholder="University / College"
              value={collegeValue}
              onChange={(event) => setCollegeValue(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              style={INPUT_STYLE}
            />
          </div>

          {collegeError ? (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 14px',
                border: '1px solid rgba(146, 64, 14, 0.18)',
                background: 'rgba(146, 64, 14, 0.05)',
                color: '#92400e',
                fontSize: '13px',
                lineHeight: 1.5,
              }}
            >
              {collegeError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={collegeLoading}
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
              cursor: collegeLoading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              opacity: collegeLoading ? 0.7 : 1,
            }}
          >
            {collegeLoading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    )
  }

  // --- Verification sent state ---
  if (verificationSent) {
    return (
      <div className="relative" style={PANEL_STYLE}>
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
            marginBottom: '12px',
          }}
        >
          Check your inbox
        </h1>

        <p
          style={{
            fontFamily: "'Work Sans', sans-serif",
            fontSize: '14px',
            color: '#73796f',
            lineHeight: 1.6,
            marginBottom: '8px',
          }}
        >
          We sent a verification link to{' '}
          <strong style={{ color: '#453a2a' }}>{verificationEmail}</strong>.
        </p>

        <p
          style={{
            fontFamily: "'Work Sans', sans-serif",
            fontSize: '14px',
            color: '#73796f',
            lineHeight: 1.6,
            marginBottom: '28px',
          }}
        >
          Click the link in that email to verify your account, then come back and sign in.
        </p>

        <p
          style={{
            fontFamily: "'Work Sans', sans-serif",
            fontSize: '12px',
            color: '#9b8f81',
            lineHeight: 1.5,
            marginBottom: '28px',
          }}
        >
          No email? Check your spam folder. The link expires in 24 hours. Trying to sign in while
          unverified will automatically resend it.
        </p>

        <button
          type="button"
          onClick={() => handleModeChange('signin')}
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
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          Back to Sign In
        </button>
      </div>
    )
  }

  // --- Main auth form ---
  return (
    <div className="relative" style={PANEL_STYLE}>
      <style>{PANEL_STYLES}</style>

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

      {/* Google sign-in */}
      <button
        type="button"
        className="marketing-google-btn"
        onClick={handleGoogleSignIn}
        disabled={googleLoading || loading}
      >
        <GoogleIcon />
        {googleLoading ? 'Please wait...' : 'Continue with Google'}
      </button>

      {/* Divider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div style={{ flex: 1, height: '1px', background: '#c3c8bd' }} />
        <span
          style={{
            fontFamily: "'Work Sans', sans-serif",
            fontSize: '12px',
            color: '#9b8f81',
            letterSpacing: '0.05em',
          }}
        >
          or
        </span>
        <div style={{ flex: 1, height: '1px', background: '#c3c8bd' }} />
      </div>

      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        className="marketing-auth-form"
      >
        {isSignUp ? (
          <>
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
            <div className="marketing-auth-input-wrap" style={FIELD_WRAPPER_STYLE}>
              <input
                className="marketing-auth-field"
                type="text"
                placeholder="University / College"
                value={college}
                onChange={(event) => setCollege(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                style={INPUT_STYLE}
              />
            </div>
          </>
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

        {!isSignUp ? (
          <div style={{ marginTop: '-10px', marginBottom: '16px', textAlign: 'right' }}>
            <button
              type="button"
              onClick={openForgotPassword}
              style={{
                color: '#3D5A35',
                cursor: 'pointer',
                textDecoration: 'underline',
                background: 'none',
                border: 'none',
                fontFamily: "'Work Sans', sans-serif",
                fontSize: '12px',
                padding: 0,
              }}
            >
              Forgot password?
            </button>
          </div>
        ) : null}

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
          disabled={loading || googleLoading}
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
            cursor: loading || googleLoading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            marginTop: '8px',
            opacity: loading || googleLoading ? 0.7 : 1,
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
