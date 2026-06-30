'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'

type ProfileOverlayProps = {
  onClose: () => void
}

function initials(name: string | null, email: string | null): string {
  if (name?.trim()) return name.trim()[0].toUpperCase()
  if (email) return email[0].toUpperCase()
  return '?'
}

function isEmailProvider(user: User) {
  return user.providerData.some((p) => p.providerId === 'password')
}

export default function ProfileOverlay({ onClose }: ProfileOverlayProps) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)

  // Profile fields
  const [fullName, setFullName] = useState('')
  const [university, setUniversity] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const profileMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const passwordMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthReady(true)
      setUser(u)
      if (!u) onClose()
    })
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'profiles', user.uid))
        if (snap.exists()) {
          const data = snap.data()
          setFullName(typeof data.fullName === 'string' ? data.fullName : '')
          setUniversity(typeof data.university === 'string' ? data.university : '')
        }
      } finally {
        setProfileLoading(false)
      }
    }
    load()
  }, [user])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const showProfileMsg = (text: string, ok: boolean) => {
    setProfileMsg({ text, ok })
    if (profileMsgTimer.current) clearTimeout(profileMsgTimer.current)
    profileMsgTimer.current = setTimeout(() => setProfileMsg(null), 4000)
  }

  const showPasswordMsg = (text: string, ok: boolean) => {
    setPasswordMsg({ text, ok })
    if (passwordMsgTimer.current) clearTimeout(passwordMsgTimer.current)
    passwordMsgTimer.current = setTimeout(() => setPasswordMsg(null), 5000)
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!fullName.trim()) { showProfileMsg('Full name cannot be empty.', false); return }
    setProfileSaving(true)
    try {
      await setDoc(
        doc(db, 'profiles', user.uid),
        { fullName: fullName.trim(), university: university.trim(), updatedAt: serverTimestamp() },
        { merge: true }
      )
      showProfileMsg('Profile saved.', true)
    } catch {
      showProfileMsg('Could not save profile. Please try again.', false)
    } finally {
      setProfileSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !user.email) return
    if (!currentPassword) { showPasswordMsg('Enter your current password.', false); return }
    if (newPassword.length < 6) { showPasswordMsg('New password must be at least 6 characters.', false); return }
    if (newPassword !== confirmPassword) { showPasswordMsg('Passwords do not match.', false); return }
    setPasswordSaving(true)
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showPasswordMsg('Password updated successfully.', true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('auth/wrong-password') || msg.includes('auth/invalid-credential')) {
        showPasswordMsg('Current password is incorrect.', false)
      } else if (msg.includes('auth/too-many-requests')) {
        showPasswordMsg('Too many attempts. Please wait and try again.', false)
      } else {
        showPasswordMsg('Could not update password. Please try again.', false)
      }
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleSignOut = async () => {
    await signOut(auth)
    onClose()
    router.push('/')
    router.refresh()
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto px-4 py-10 sm:items-center"
      style={{ background: 'rgba(30,27,21,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="relative w-full max-w-[600px] rounded-2xl bg-[#fff8f0] px-6 py-7 md:px-9 md:py-8"
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.22)', fontFamily: "'Work Sans', sans-serif" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#73796f] text-2xl leading-none bg-transparent border-none cursor-pointer hover:text-[#453a2a] transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        <p className="text-[10px] uppercase tracking-[0.32em] text-[#3D5A35]/55 font-semibold">
          Compendium X · Account
        </p>
        <h1
          className="mt-1 mb-6 text-3xl font-light tracking-tight text-[#453a2a]"
          style={{ fontFamily: "'Newsreader', serif" }}
        >
          My Profile
        </h1>

        {!authReady || profileLoading || !user ? (
          <div className="py-16 text-center text-[14px] text-[#5c4033]">Loading...</div>
        ) : (
          <>
            {/* ── Card 1: Profile ── */}
            <section className="mb-5 rounded-2xl border border-[#b48a57]/16 bg-[rgba(255,248,240,0.85)] px-5 py-6 md:px-7 md:py-7" style={{ boxShadow: '0 4px 18px rgba(59,47,47,0.05)' }}>
              <div className="mb-5 flex items-center gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
                  style={{ background: '#3D5A35', fontFamily: "'Newsreader', serif" }}
                >
                  {initials(fullName || user.displayName, user.email)}
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[#5c4033]/60 font-medium">Profile</p>
                  <p className="text-[15px] font-medium text-[#453a2a]">{fullName || user.displayName || user.email}</p>
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#5c4033]/65">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full border border-[#c3c8bd] bg-[#faf3e9] px-4 py-3 text-[14px] text-[#1e1b15] outline-none transition-colors focus:border-[#3D5A35]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#5c4033]/65">
                    University / College
                  </label>
                  <input
                    type="text"
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    placeholder="e.g. SRCC, FMS, IIM Ahmedabad"
                    className="w-full border border-[#c3c8bd] bg-[#faf3e9] px-4 py-3 text-[14px] text-[#1e1b15] outline-none transition-colors focus:border-[#3D5A35]"
                  />
                </div>

                {profileMsg ? (
                  <div
                    className="px-4 py-3 text-[13px]"
                    style={{
                      border: `1px solid ${profileMsg.ok ? 'rgba(61,90,53,0.2)' : 'rgba(146,64,14,0.2)'}`,
                      background: profileMsg.ok ? 'rgba(61,90,53,0.05)' : 'rgba(146,64,14,0.05)',
                      color: profileMsg.ok ? '#3D5A35' : '#92400e',
                    }}
                  >
                    {profileMsg.text}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={profileSaving}
                  className="w-full py-3 text-[11px] uppercase tracking-[0.22em] font-medium text-white transition-opacity disabled:opacity-60"
                  style={{ background: '#3D5A35' }}
                >
                  {profileSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </section>

            {/* ── Card 2: Account ── */}
            <section className="mb-5 rounded-2xl border border-[#b48a57]/16 bg-[rgba(255,248,240,0.85)] px-5 py-6 md:px-7 md:py-7" style={{ boxShadow: '0 4px 18px rgba(59,47,47,0.05)' }}>
              <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-[#5c4033]/60 font-medium">Account</p>

              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#5c4033]/50 font-medium">Email Address</p>
                  <p className="text-[14px] text-[#453a2a] font-medium">{user.email ?? '—'}</p>
                </div>
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#5c4033]/50 font-medium">Sign-In Method</p>
                  <span
                    className="inline-block px-3 py-1 text-[11px] uppercase tracking-[0.15em] font-medium"
                    style={{
                      border: '1px solid rgba(61,90,53,0.2)',
                      background: 'rgba(61,90,53,0.06)',
                      color: '#3D5A35',
                    }}
                  >
                    {isEmailProvider(user) ? 'Email & Password' : 'Google'}
                  </span>
                </div>
              </div>
            </section>

            {/* ── Card 3: Security (email users only) ── */}
            {isEmailProvider(user) ? (
              <section className="mb-5 rounded-2xl border border-[#b48a57]/16 bg-[rgba(255,248,240,0.85)] px-5 py-6 md:px-7 md:py-7" style={{ boxShadow: '0 4px 18px rgba(59,47,47,0.05)' }}>
                <p className="mb-4 text-[11px] uppercase tracking-[0.22em] text-[#5c4033]/60 font-medium">Security</p>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#5c4033]/65">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      autoComplete="current-password"
                      className="w-full border border-[#c3c8bd] bg-[#faf3e9] px-4 py-3 text-[14px] text-[#1e1b15] outline-none transition-colors focus:border-[#3D5A35]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#5c4033]/65">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                      className="w-full border border-[#c3c8bd] bg-[#faf3e9] px-4 py-3 text-[14px] text-[#1e1b15] outline-none transition-colors focus:border-[#3D5A35]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#5c4033]/65">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      autoComplete="new-password"
                      className="w-full border border-[#c3c8bd] bg-[#faf3e9] px-4 py-3 text-[14px] text-[#1e1b15] outline-none transition-colors focus:border-[#3D5A35]"
                    />
                  </div>

                  {passwordMsg ? (
                    <div
                      className="px-4 py-3 text-[13px]"
                      style={{
                        border: `1px solid ${passwordMsg.ok ? 'rgba(61,90,53,0.2)' : 'rgba(146,64,14,0.2)'}`,
                        background: passwordMsg.ok ? 'rgba(61,90,53,0.05)' : 'rgba(146,64,14,0.05)',
                        color: passwordMsg.ok ? '#3D5A35' : '#92400e',
                      }}
                    >
                      {passwordMsg.text}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={passwordSaving}
                    className="w-full py-3 text-[11px] uppercase tracking-[0.22em] font-medium text-white transition-opacity disabled:opacity-60"
                    style={{ background: '#3D5A35' }}
                  >
                    {passwordSaving ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              </section>
            ) : null}

            {/* ── Sign Out ── */}
            <div className="mt-6 border-t border-[#b48a57]/16 pt-6">
              <button
                onClick={handleSignOut}
                className="w-full py-3 text-[11px] uppercase tracking-[0.22em] font-medium transition-colors"
                style={{
                  border: '1px solid rgba(146,64,14,0.25)',
                  background: 'rgba(146,64,14,0.04)',
                  color: '#92400e',
                }}
              >
                Sign Out
              </button>
              <p className="mt-2 text-center text-[11px] text-[#9b8f81]">Signs you out on this device.</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
