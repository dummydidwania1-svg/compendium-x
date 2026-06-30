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

type Section = 'profile' | 'account' | 'security'

function initials(name: string | null, email: string | null): string {
  if (name?.trim()) return name.trim()[0].toUpperCase()
  if (email) return email[0].toUpperCase()
  return '?'
}

function isEmailProvider(user: User) {
  return user.providerData.some((p) => p.providerId === 'password')
}

const fieldClass =
  'profile-input w-full rounded-xl px-4 py-2.5 text-[13px] text-[#1e1b15] outline-none'
const labelClass = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5c4033]/60'
const sectionTitleClass = 'mb-5 text-[17px] font-medium text-[#3B2F2F]'
const sectionTitleStyle = { fontFamily: "'Newsreader', serif" }
const primaryBtnClass =
  'profile-btn-primary rounded-full px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#fff8f0] disabled:opacity-55 disabled:cursor-not-allowed'

export default function ProfileOverlay({ onClose }: ProfileOverlayProps) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [section, setSection] = useState<Section>('profile')

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

  const emailProvider = user ? isEmailProvider(user) : false

  const NAV_ITEMS: Array<{ id: Section; label: string; icon: string }> = [
    { id: 'profile', label: 'Profile', icon: 'person' },
    { id: 'account', label: 'Account', icon: 'mail' },
    ...(emailProvider ? [{ id: 'security' as Section, label: 'Security', icon: 'lock' }] : []),
  ]

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-8"
      style={{ background: 'rgba(30,27,21,0.5)', backdropFilter: 'blur(6px)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <style>{`
        .profile-input {
          background: linear-gradient(180deg, rgba(255,249,242,0.85) 0%, rgba(247,240,231,0.7) 100%);
          border: 1px solid rgba(92,64,51,0.14);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
        }
        .profile-input:focus {
          border-color: rgba(61,90,53,0.4);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), 0 0 0 3px rgba(61,90,53,0.1);
        }
        .profile-input::placeholder { color: rgba(92,64,51,0.38); }
        .profile-btn-primary {
          background: linear-gradient(180deg, #44643a 0%, #34502d 100%);
          box-shadow: 0 6px 16px rgba(61,90,53,0.22), inset 0 1px 0 rgba(255,255,255,0.2);
          transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
        }
        .profile-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 22px rgba(61,90,53,0.26), inset 0 1px 0 rgba(255,255,255,0.24);
        }
        .profile-nav-item {
          transition: background-color 0.16s ease, color 0.16s ease;
        }
        .profile-overlay-panel {
          animation: profile-overlay-in 0.22s cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes profile-overlay-in {
          from { opacity: 0; transform: translateY(10px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        className="profile-overlay-panel relative flex w-full max-w-[700px] overflow-hidden rounded-[28px] bg-[#fff8f0]"
        style={{
          boxShadow: '0 28px 70px rgba(43,33,24,0.28), 0 1px 0 rgba(255,255,255,0.4) inset',
          fontFamily: "'Work Sans', sans-serif",
          minHeight: '440px',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-[#8a7c6a] text-xl leading-none bg-[rgba(180,138,87,0.08)] border-none cursor-pointer hover:bg-[rgba(180,138,87,0.16)] hover:text-[#453a2a] transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        {!authReady || profileLoading || !user ? (
          <div className="flex w-full items-center justify-center py-16 text-center text-[14px] text-[#5c4033]">Loading...</div>
        ) : (
          <>
            {/* ── Left sidebar ── */}
            <div className="w-[190px] shrink-0 px-4 py-7 sm:w-[210px]" style={{ background: 'linear-gradient(180deg, rgba(244,233,217,0.75) 0%, rgba(238,224,203,0.55) 100%)' }}>
              <div className="mb-6 flex items-center gap-2.5 px-1.5">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                  style={{ background: 'linear-gradient(160deg, #4a6b41 0%, #34502d 100%)', fontFamily: "'Newsreader', serif", boxShadow: '0 3px 8px rgba(61,90,53,0.3)' }}
                >
                  {initials(fullName || user.displayName, user.email)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-[#453a2a]">{fullName || user.displayName || 'Account'}</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#3D5A35]/55 font-semibold">Settings</p>
                </div>
              </div>

              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className="profile-nav-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px]"
                    style={{
                      background: section === item.id ? 'rgba(61,90,53,0.12)' : 'transparent',
                      color: section === item.id ? '#2f4a28' : '#5c4033',
                      fontWeight: section === item.id ? 600 : 400,
                      boxShadow: section === item.id ? 'inset 0 1px 0 rgba(255,255,255,0.5)' : 'none',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="mt-5 border-t border-[#b48a57]/20 pt-4">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="profile-nav-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] hover:bg-[rgba(146,64,14,0.09)]"
                  style={{ color: '#92400e' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>logout</span>
                  Sign Out
                </button>
              </div>
            </div>

            {/* ── Right content ── */}
            <div className="flex-1 px-7 py-7 sm:px-9">
              {section === 'profile' ? (
                <>
                  <p className={sectionTitleClass} style={sectionTitleStyle}>Profile</p>

                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div>
                      <label className={labelClass}>Full Name</label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Your full name"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>University / College</label>
                      <input
                        type="text"
                        value={university}
                        onChange={(e) => setUniversity(e.target.value)}
                        placeholder="e.g. SRCC, FMS, IIM Ahmedabad"
                        className={fieldClass}
                      />
                    </div>

                    {profileMsg ? (
                      <div
                        className="rounded-xl px-4 py-2.5 text-[12px]"
                        style={{
                          border: `1px solid ${profileMsg.ok ? 'rgba(61,90,53,0.2)' : 'rgba(146,64,14,0.2)'}`,
                          background: profileMsg.ok ? 'rgba(61,90,53,0.06)' : 'rgba(146,64,14,0.06)',
                          color: profileMsg.ok ? '#3D5A35' : '#92400e',
                        }}
                      >
                        {profileMsg.text}
                      </div>
                    ) : null}

                    <button type="submit" disabled={profileSaving} className={primaryBtnClass}>
                      {profileSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </form>
                </>
              ) : null}

              {section === 'account' ? (
                <>
                  <p className={sectionTitleClass} style={sectionTitleStyle}>Account</p>
                  <div className="space-y-5">
                    <div>
                      <p className={labelClass}>Email Address</p>
                      <p className="text-[13.5px] text-[#453a2a] font-medium">{user.email ?? '—'}</p>
                    </div>
                    <div>
                      <p className={labelClass}>Sign-In Method</p>
                      <span
                        className="inline-block rounded-full px-3.5 py-1 text-[11px] uppercase tracking-[0.15em] font-semibold"
                        style={{
                          border: '1px solid rgba(61,90,53,0.22)',
                          background: 'rgba(61,90,53,0.08)',
                          color: '#3D5A35',
                        }}
                      >
                        {emailProvider ? 'Email & Password' : 'Google'}
                      </span>
                    </div>
                  </div>
                </>
              ) : null}

              {section === 'security' && emailProvider ? (
                <>
                  <p className={sectionTitleClass} style={sectionTitleStyle}>Security</p>
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                      <label className={labelClass}>Current Password</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        autoComplete="current-password"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        autoComplete="new-password"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        autoComplete="new-password"
                        className={fieldClass}
                      />
                    </div>

                    {passwordMsg ? (
                      <div
                        className="rounded-xl px-4 py-2.5 text-[12px]"
                        style={{
                          border: `1px solid ${passwordMsg.ok ? 'rgba(61,90,53,0.2)' : 'rgba(146,64,14,0.2)'}`,
                          background: passwordMsg.ok ? 'rgba(61,90,53,0.06)' : 'rgba(146,64,14,0.06)',
                          color: passwordMsg.ok ? '#3D5A35' : '#92400e',
                        }}
                      >
                        {passwordMsg.text}
                      </div>
                    ) : null}

                    <button type="submit" disabled={passwordSaving} className={primaryBtnClass}>
                      {passwordSaving ? 'Updating...' : 'Update Password'}
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
