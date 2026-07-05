'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, db, storage } from '@/lib/firebase/config'
import { apiDelete } from '@/lib/api/client'
import { PRESET_AVATARS } from '@/lib/avatars'

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

/** Center-crop + downscale to a square JPEG so avatars stay light and crisp. */
async function resizeToSquare(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unsupported')
  const min = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - min) / 2
  const sy = (bitmap.height - min) / 2
  ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, size, size)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Encode failed'))),
      'image/jpeg',
      0.9,
    ),
  )
}

function PresetAvatarView({ id, className }: { id: string; className?: string }) {
  const a = PRESET_AVATARS.find((p) => p.id === id)
  if (!a) return null
  const svgHtml = { __html: a.svg }
  return <span className={className} aria-hidden dangerouslySetInnerHTML={svgHtml} />
}

const fieldClass = 'ccx-input w-full px-4 py-2.5 text-[13px] text-[#1e1b15] outline-none'
const labelClass =
  'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5c4033]/60'
const sectionTitleClass = 'text-[18px] font-medium text-[#3B2F2F]'
const sectionTitleStyle = { fontFamily: "'Newsreader', serif" }
const iconStyle = { fontSize: 18 }
const initialsStyle = { fontFamily: "'Newsreader', serif" }
const signInBadgeStyle = {
  border: '1px solid rgba(61,90,53,0.28)',
  background: 'rgba(61,90,53,0.08)',
  color: '#3D5A35',
}
const deleteMsgStyle = {
  border: '1px solid rgba(180,84,62,0.25)',
  background: 'rgba(180,84,62,0.06)',
  color: '#b4543e',
}

function SubmitButton({ disabled, children }: { disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="ccx-btn-primary px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em]"
    >
      {children}
    </button>
  )
}

// Centered, blurred, same tone/build as the rest of the "are you sure"
// overlays in the app (e.g. the Safari remote-mode block) — a last, friendly
// gate before a Danger Zone action actually fires, not a scary legal wall.
function DeactivateConfirmModal({
  deleting,
  onConfirm,
  onCancel,
}: {
  deleting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !deleting) onCancel()
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(69,58,42,0.10)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          animation: 'ccx-dcm-scrim-in 0.4s ease forwards',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ccx-dcm-title"
        style={{
          position: 'relative', zIndex: 1,
          width: 'min(380px, calc(100vw - 48px))',
          borderRadius: 0,
          border: '1px solid rgba(180,84,62,0.28)',
          background: 'rgba(255,248,240,0.96)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          boxShadow: '0 12px 48px rgba(59,47,47,0.16), 0 2px 8px rgba(59,47,47,0.07)',
          overflow: 'hidden',
          animation: 'ccx-dcm-card-in 0.32s cubic-bezier(0.22,1,0.36,1) both',
        }}
      >
        <div style={{ height: '2px', background: 'linear-gradient(90deg, #b4543e 0%, rgba(180,84,62,0.12) 100%)' }} />
        <div style={{ padding: '24px 22px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <p id="ccx-dcm-title" style={{ fontFamily: "'Newsreader', serif", fontSize: '18px', fontWeight: 500, color: '#3B2F2F', lineHeight: 1.3 }}>
              Hang on, one more check
            </p>
            <p style={{ fontSize: '12.5px', color: 'rgba(92,64,51,0.72)', lineHeight: 1.55 }}>
              This deactivates your account and signs you out everywhere.
              It&apos;s not a delete though, nothing gets erased. Your
              profile, evaluations, and files all stay put, we just
              won&apos;t let anyone sign back in until it&apos;s sorted out
              on our end. Still want to go ahead?
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="ccx-btn-ghost px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
            >
              Never mind
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="ccx-danger-solid px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
            >
              {deleting ? 'Deactivating...' : 'Yes, deactivate'}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes ccx-dcm-scrim-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ccx-dcm-card-in { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </div>
  )
}

export default function ProfileOverlay({ onClose }: ProfileOverlayProps) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [section, setSection] = useState<Section>('profile')

  // Profile fields
  const [fullName, setFullName] = useState('')
  const [university, setUniversity] = useState('')
  const [originalFullName, setOriginalFullName] = useState('')
  const [originalUniversity, setOriginalUniversity] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Avatar
  const [photoURL, setPhotoURL] = useState<string | null>(null)
  const [avatarPreset, setAvatarPreset] = useState<string | null>(null)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // Delete account
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [showDeactivateModal, setShowDeactivateModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null)

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
          const loadedName = typeof data.fullName === 'string' ? data.fullName : ''
          const loadedUniversity = typeof data.university === 'string' ? data.university : ''
          setFullName(loadedName)
          setUniversity(loadedUniversity)
          setOriginalFullName(loadedName)
          setOriginalUniversity(loadedUniversity)
          setPhotoURL(typeof data.photoURL === 'string' ? data.photoURL : null)
          setAvatarPreset(typeof data.avatarPreset === 'string' ? data.avatarPreset : null)
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

  const isProfileDirty =
    fullName.trim() !== originalFullName.trim() || university.trim() !== originalUniversity.trim()

  const isPasswordReady =
    currentPassword.length > 0 && newPassword.length >= 6 && confirmPassword.length > 0

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !isProfileDirty) return
    if (!fullName.trim()) {
      showProfileMsg('Full name cannot be empty.', false)
      return
    }
    setProfileSaving(true)
    try {
      await setDoc(
        doc(db, 'profiles', user.uid),
        { fullName: fullName.trim(), university: university.trim(), updatedAt: serverTimestamp() },
        { merge: true },
      )
      setOriginalFullName(fullName.trim())
      setOriginalUniversity(university.trim())
      showProfileMsg('Profile saved.', true)
    } catch {
      showProfileMsg('Could not save profile. Please try again.', false)
    } finally {
      setProfileSaving(false)
    }
  }

  const handleAvatarFile = async (file: File) => {
    if (!user) return
    if (!file.type.startsWith('image/')) {
      showProfileMsg('Please choose an image file.', false)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showProfileMsg('Image must be under 5 MB.', false)
      return
    }
    setAvatarBusy(true)
    try {
      const blob = await resizeToSquare(file, 256)
      const storageRef = ref(storage, `avatars/${user.uid}/avatar_${Date.now()}.jpg`)
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
      const url = await getDownloadURL(storageRef)
      await setDoc(
        doc(db, 'profiles', user.uid),
        { photoURL: url, avatarPreset: null, updatedAt: serverTimestamp() },
        { merge: true },
      )
      try {
        await updateProfile(user, { photoURL: url })
      } catch {
        // non-fatal: Firestore is the source of truth for the in-app avatar
      }
      setPhotoURL(url)
      setAvatarPreset(null)
      setShowAvatarPicker(false)
      showProfileMsg('Photo updated.', true)
    } catch {
      showProfileMsg('Could not upload photo. Please try again.', false)
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleSelectPreset = async (id: string) => {
    if (!user) return
    setAvatarBusy(true)
    try {
      await setDoc(
        doc(db, 'profiles', user.uid),
        { avatarPreset: id, photoURL: null, updatedAt: serverTimestamp() },
        { merge: true },
      )
      setAvatarPreset(id)
      setPhotoURL(null)
      setShowAvatarPicker(false)
      showProfileMsg('Avatar updated.', true)
    } catch {
      showProfileMsg('Could not update avatar. Please try again.', false)
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleUseGooglePhoto = async () => {
    if (!user) return
    setAvatarBusy(true)
    try {
      await setDoc(
        doc(db, 'profiles', user.uid),
        { avatarPreset: null, photoURL: null, updatedAt: serverTimestamp() },
        { merge: true },
      )
      setAvatarPreset(null)
      setPhotoURL(null)
      setShowAvatarPicker(false)
    } finally {
      setAvatarBusy(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !user.email || !isPasswordReady) return
    if (newPassword !== confirmPassword) {
      showPasswordMsg('Passwords do not match.', false)
      return
    }
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

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return
    setDeleting(true)
    setDeleteMsg(null)
    try {
      await apiDelete('/api/account', { confirm: 'DELETE' })
      await signOut(auth)
      onClose()
      router.push('/')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setDeleteMsg(msg || 'Could not deactivate account. Please try again.')
      setDeleting(false)
    }
  }

  const emailProvider = user ? isEmailProvider(user) : false

  const NAV_ITEMS: Array<{ id: Section; label: string; icon: string }> = [
    { id: 'profile', label: 'Profile', icon: 'person' },
    { id: 'account', label: 'Account', icon: 'mail' },
    ...(emailProvider ? [{ id: 'security' as Section, label: 'Security', icon: 'lock' }] : []),
  ]

  const resolvedPhoto = photoURL || user?.photoURL || null
  const avatarNode = avatarPreset ? (
    <PresetAvatarView id={avatarPreset} className="block h-full w-full [&>svg]:h-full [&>svg]:w-full" />
  ) : resolvedPhoto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resolvedPhoto} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
  ) : (
    <span
      className="ccx-avatar-initials flex h-full w-full items-center justify-center text-[20px] font-semibold text-[#fff8f0]"
      style={initialsStyle}
    >
      {initials(fullName || user?.displayName || null, user?.email ?? null)}
    </span>
  )

  return (
    <div
      className="ccx-profile-backdrop fixed inset-0 z-[200] flex items-center justify-center px-4 py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <style>{`
        .ccx-profile-backdrop {
          background: rgba(43,34,24,0.30);
          backdrop-filter: blur(22px) saturate(120%);
          -webkit-backdrop-filter: blur(22px) saturate(120%);
          animation: ccx-fade-in 0.2s ease both;
        }
        @keyframes ccx-fade-in { from { opacity: 0 } to { opacity: 1 } }
        .ccx-profile-panel {
          border: 1px solid rgba(92,64,51,0.16);
          box-shadow: 0 24px 60px -28px rgba(43,34,24,0.5);
          border-radius: 0;
          animation: ccx-panel-in 0.24s cubic-bezier(0.22,1,0.36,1) both;
        }
        .ccx-page .ccx-profile-panel { border-radius: 0 !important; }
        @keyframes ccx-panel-in {
          from { opacity: 0; transform: translateY(12px) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ccx-flicker {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.93); }
        }
        .ccx-flicker { animation: ccx-flicker 1.1s ease-in-out infinite; }
        .ccx-input {
          background: #fffdf9;
          border: 1px solid rgba(92,64,51,0.18);
          border-radius: 0;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .ccx-input:focus {
          border-color: #3D5A35;
          box-shadow: 0 0 0 3px rgba(61,90,53,0.12);
        }
        .ccx-input::placeholder { color: rgba(92,64,51,0.38); }
        .ccx-btn-primary {
          background: #3D5A35;
          color: #fff8f0;
          border-radius: 0;
          transition: background 0.16s ease, transform 0.16s ease;
        }
        .ccx-btn-primary:hover:not(:disabled) { background: #33502d; transform: translateY(-1px); }
        .ccx-btn-primary:disabled {
          background: rgba(92,64,51,0.10);
          color: rgba(92,64,51,0.4);
          cursor: not-allowed;
        }
        .ccx-nav-item {
          color: #5C4033;
          border-radius: 0;
          position: relative;
          transition: background-color 0.16s ease, color 0.16s ease;
        }
        .ccx-nav-item:hover { background: rgba(92,64,51,0.06); }
        .ccx-nav-active { background: rgba(61,90,53,0.10); color: #3D5A35; font-weight: 600; }
        .ccx-nav-active::before {
          content: '';
          position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: #D8B978;
        }
        .ccx-signout { color: #5C4033; border-radius: 0; transition: background-color 0.16s ease, color 0.16s ease; }
        .ccx-signout:hover { background: rgba(180,84,62,0.10); color: #b4543e; }
        .ccx-avatar {
          border: 1px solid rgba(92,64,51,0.18);
          border-radius: 0;
          background: linear-gradient(180deg, #5C4033 0%, #3B2F2F 100%);
        }
        .ccx-avatar-choice {
          border: 1px solid rgba(92,64,51,0.14);
          border-radius: 0;
          cursor: pointer;
          transition: transform 0.14s ease, box-shadow 0.14s ease;
        }
        .ccx-avatar-choice:hover { transform: translateY(-1px); box-shadow: 0 6px 14px -8px rgba(43,34,24,0.5); }
        .ccx-avatar-choice-active { box-shadow: 0 0 0 2px #3D5A35; }
        .ccx-avatar-picker { border: 1px solid rgba(92,64,51,0.14); background: #f4ede3; border-radius: 0; }
        .ccx-chip {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid rgba(92,64,51,0.22);
          background: #fffdf9; color: #5C4033;
          padding: 6px 12px; font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.12em; border-radius: 0;
          transition: background-color 0.16s ease;
        }
        .ccx-chip:hover { background: rgba(92,64,51,0.06); }
        .ccx-danger-btn {
          border: 1px solid rgba(180,84,62,0.4);
          color: #b4543e; background: transparent; border-radius: 0;
          transition: background-color 0.16s ease, color 0.16s ease;
        }
        .ccx-danger-btn:hover { background: #b4543e; color: #fff8f0; }
        .ccx-danger-solid { background: #b4543e; color: #fff8f0; border-radius: 0; transition: background-color 0.16s ease; }
        .ccx-danger-solid:hover:not(:disabled) { background: #9d4433; }
        .ccx-danger-solid:disabled { background: rgba(180,84,62,0.35); cursor: not-allowed; }
        .ccx-btn-ghost { border: 1px solid rgba(92,64,51,0.22); color: #5C4033; background: transparent; border-radius: 0; }
        .ccx-btn-ghost:hover { background: rgba(92,64,51,0.06); }
        .ccx-msg { border-radius: 0; }
      `}</style>

      <div className="ccx-profile-panel relative flex w-full max-w-[680px] overflow-hidden bg-[#fff8f0]">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 z-20 flex h-8 w-8 items-center justify-center text-[#8a7c6a] text-xl leading-none bg-[rgba(180,138,87,0.08)] border-none cursor-pointer hover:bg-[rgba(180,138,87,0.16)] hover:text-[#453a2a] transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        {showDeactivateModal ? (
          <DeactivateConfirmModal
            deleting={deleting}
            onCancel={() => setShowDeactivateModal(false)}
            onConfirm={() => {
              setShowDeactivateModal(false)
              void handleDeleteAccount()
            }}
          />
        ) : null}

        {deleting ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#fff8f0]/90">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo2.png" alt="" width={44} height={44} className="ccx-flicker" />
          </div>
        ) : null}

        {!authReady || profileLoading || !user ? (
          <div className="flex w-full items-center justify-center py-20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo2.png" alt="Loading" width={44} height={44} className="ccx-flicker" />
          </div>
        ) : (
          <>
            {/* Left sidebar */}
            <div className="w-[190px] shrink-0 border-r border-[#b48a57]/20 bg-[#f4ede3] px-4 py-7 sm:w-[210px]">
              <div className="mb-6 flex items-center gap-2.5 px-1.5">
                <div className="ccx-avatar flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden">
                  {avatarNode}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-[#453a2a]">
                    {fullName || user.displayName || 'Account'}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#3D5A35]/55 font-semibold">
                    Settings
                  </p>
                </div>
              </div>

              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`ccx-nav-item flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] ${
                      section === item.id ? 'ccx-nav-active' : ''
                    }`}
                  >
                    <span className="material-symbols-outlined" style={iconStyle}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="mt-5 border-t border-[#b48a57]/20 pt-4">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="ccx-signout flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px]"
                >
                  <span className="material-symbols-outlined" style={iconStyle}>
                    logout
                  </span>
                  Sign Out
                </button>
              </div>
            </div>

            {/* Right content */}
            <div className="flex-1 px-7 py-7 sm:px-9">
              {section === 'profile' ? (
                <>
                  <p className={`${sectionTitleClass} mb-5`} style={sectionTitleStyle}>
                    Profile
                  </p>

                  <div className="mb-6 flex items-center gap-4">
                    <div className="ccx-avatar h-16 w-16 shrink-0 overflow-hidden">{avatarNode}</div>
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowAvatarPicker((v) => !v)}
                        className="text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3D5A35] hover:text-[#33502d]"
                      >
                        {showAvatarPicker ? 'Close' : 'Change avatar'}
                      </button>
                      <p className="text-[11px] text-[#5c4033]/60">
                        Upload a photo, pick a CompendiumX avatar, or use your Google photo.
                      </p>
                    </div>
                  </div>

                  {showAvatarPicker ? (
                    <div className="ccx-avatar-picker mb-6 p-4">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5c4033]/60">
                        Choose an avatar
                      </p>
                      <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-8">
                        {PRESET_AVATARS.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            title={a.label}
                            disabled={avatarBusy}
                            onClick={() => handleSelectPreset(a.id)}
                            className={`ccx-avatar-choice aspect-square overflow-hidden ${
                              avatarPreset === a.id ? 'ccx-avatar-choice-active' : ''
                            }`}
                          >
                            <PresetAvatarView
                              id={a.id}
                              className="block h-full w-full [&>svg]:h-full [&>svg]:w-full"
                            />
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="ccx-chip cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={avatarBusy}
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) handleAvatarFile(f)
                              e.currentTarget.value = ''
                            }}
                          />
                          Upload photo
                        </label>
                        {!emailProvider ? (
                          <button
                            type="button"
                            className="ccx-chip"
                            disabled={avatarBusy}
                            onClick={handleUseGooglePhoto}
                          >
                            Use Google photo
                          </button>
                        ) : null}
                        {avatarBusy ? (
                          <span className="text-[11px] text-[#5c4033]/60">Working...</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

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
                        className="ccx-msg px-4 py-2.5 text-[12px]"
                        style={{
                          border: `1px solid ${profileMsg.ok ? 'rgba(61,90,53,0.2)' : 'rgba(180,84,62,0.25)'}`,
                          background: profileMsg.ok ? 'rgba(61,90,53,0.06)' : 'rgba(180,84,62,0.06)',
                          color: profileMsg.ok ? '#3D5A35' : '#b4543e',
                        }}
                      >
                        {profileMsg.text}
                      </div>
                    ) : null}

                    <SubmitButton disabled={!isProfileDirty || profileSaving}>
                      {profileSaving ? 'Saving...' : 'Save Changes'}
                    </SubmitButton>
                  </form>
                </>
              ) : null}

              {section === 'account' ? (
                <>
                  <p className={`${sectionTitleClass} mb-5`} style={sectionTitleStyle}>
                    Account
                  </p>
                  <div className="space-y-5">
                    <div>
                      <p className={labelClass}>Email Address</p>
                      <p className="text-[13.5px] text-[#453a2a] font-medium">{user.email ?? '—'}</p>
                    </div>
                    <div>
                      <p className={labelClass}>Sign-In Method</p>
                      <span
                        className="inline-block px-3.5 py-1 text-[11px] uppercase tracking-[0.15em] font-semibold"
                        style={signInBadgeStyle}
                      >
                        {emailProvider ? 'Email & Password' : 'Google'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-8 border-t border-[#b4543e]/20 pt-5">
                    <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#b4543e]">
                      Danger Zone
                    </p>
                    <p className="mb-3 text-[12px] text-[#5c4033]/70">
                      Deactivating your account signs you out everywhere and blocks sign-in.
                      Nothing is deleted; your profile, avatars, evaluations, and recordings
                      are all kept exactly as they are.
                    </p>
                    {!deleteOpen ? (
                      <button
                        type="button"
                        className="ccx-danger-btn px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
                        onClick={() => setDeleteOpen(true)}
                      >
                        Deactivate account
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-[12px] text-[#453a2a]">
                          Type <span className="font-semibold">DELETE</span> to confirm.
                        </p>
                        <input
                          value={deleteConfirm}
                          onChange={(e) => setDeleteConfirm(e.target.value)}
                          placeholder="DELETE"
                          className={fieldClass}
                        />
                        {deleteMsg ? (
                          <div className="ccx-msg px-4 py-2.5 text-[12px]" style={deleteMsgStyle}>
                            {deleteMsg}
                          </div>
                        ) : null}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={deleteConfirm !== 'DELETE' || deleting}
                            onClick={() => setShowDeactivateModal(true)}
                            className="ccx-danger-solid px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
                          >
                            {deleting ? 'Deactivating...' : 'Deactivate account'}
                          </button>
                          <button
                            type="button"
                            className="ccx-btn-ghost px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
                            onClick={() => {
                              setDeleteOpen(false)
                              setDeleteConfirm('')
                              setDeleteMsg(null)
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}

              {section === 'security' && emailProvider ? (
                <>
                  <p className={`${sectionTitleClass} mb-5`} style={sectionTitleStyle}>
                    Security
                  </p>
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
                        className="ccx-msg px-4 py-2.5 text-[12px]"
                        style={{
                          border: `1px solid ${passwordMsg.ok ? 'rgba(61,90,53,0.2)' : 'rgba(180,84,62,0.25)'}`,
                          background: passwordMsg.ok ? 'rgba(61,90,53,0.06)' : 'rgba(180,84,62,0.06)',
                          color: passwordMsg.ok ? '#3D5A35' : '#b4543e',
                        }}
                      >
                        {passwordMsg.text}
                      </div>
                    ) : null}

                    <SubmitButton disabled={!isPasswordReady || passwordSaving}>
                      {passwordSaving ? 'Updating...' : 'Update Password'}
                    </SubmitButton>
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
