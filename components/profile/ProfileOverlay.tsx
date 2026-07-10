'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, db, storage } from '@/lib/firebase/config'
import { PRESET_AVATARS } from '@/lib/avatars'
import PresetAvatarView from '@/components/avatars/PresetAvatarView'

type ProfileOverlayProps = {
  onClose: () => void
}

type Section = 'profile' | 'account'

/** Sentinel preset id: the user explicitly chose plain initials over any photo. */
const INITIALS_PRESET = 'initials'

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

const fieldClass = 'ccx-input w-full px-4 py-2.5 text-[13px] text-[#1e1b15] outline-none'
const labelClass =
  'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5c4033]/55'
const sectionTitleClass = 'text-[19px] font-medium text-[#3B2F2F]'
const serifStyle = { fontFamily: "'Newsreader', serif" }
const iconStyle = { fontSize: 18 }

/** Tiny inline status that fades in beside an action, then fades away. No boxes. */
function InlineStatus({ status }: { status: { text: string; ok: boolean } | null }) {
  if (!status) return null
  return (
    <span
      key={status.text}
      className="ccx-inline-status inline-flex items-center gap-1.5 text-[11px] font-medium"
      style={{ color: status.ok ? '#3D5A35' : '#b4543e' }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
        {status.ok ? 'check' : 'error'}
      </span>
      {status.text}
    </span>
  )
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

// Same overlay build used elsewhere on the platform: no typed
// confirmation, just a plain "are you sure" with two ways forward.
function SignOutConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(69,58,42,0.10)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          animation: 'ccx-som-scrim-in 0.4s ease forwards',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ccx-som-title"
        style={{
          position: 'relative', zIndex: 1,
          width: 'min(360px, calc(100vw - 48px))',
          borderRadius: 0,
          border: '1px solid rgba(92,64,51,0.20)',
          background: 'rgba(255,248,240,0.97)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          boxShadow: '0 12px 48px rgba(59,47,47,0.16), 0 2px 8px rgba(59,47,47,0.07)',
          overflow: 'hidden',
          animation: 'ccx-som-card-in 0.32s cubic-bezier(0.22,1,0.36,1) both',
        }}
      >
        <div style={{ height: 2, background: 'linear-gradient(90deg, #3D5A35 0%, rgba(61,90,53,0.12) 100%)' }} />
        <div style={{ padding: '22px 22px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p id="ccx-som-title" style={{ ...serifStyle, fontSize: 18, fontWeight: 500, color: '#3B2F2F', lineHeight: 1.25 }}>
            Sign out?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={onCancel}
              className="ccx-btn-ghost px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
            >
              Stay
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="ccx-btn-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes ccx-som-scrim-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ccx-som-card-in { from { opacity: 0; transform: translateY(10px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
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
  // Firestore-mirrored Google account photo — see handleUseGooglePhoto for
  // why this can't just be read from the live Auth user.photoURL.
  const [googlePhotoURL, setGooglePhotoURL] = useState<string | null>(null)
  const [avatarPreset, setAvatarPreset] = useState<string | null>(null)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  // Sign out
  const [showSignOutModal, setShowSignOutModal] = useState(false)

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

          const storedGooglePhoto = typeof data.googlePhotoURL === 'string' ? data.googlePhotoURL : null
          setGooglePhotoURL(storedGooglePhoto)
          // First-ever load only: seed googlePhotoURL from the live Auth
          // user. Never overwrite an EXISTING value here — user.photoURL
          // can be permanently poisoned by the old upload bug (it clobbered
          // Auth's photoURL with the uploaded image), so only the explicit
          // "Use Google photo" re-auth flow is allowed to refresh it.
          if (!storedGooglePhoto && user.photoURL) {
            void setDoc(doc(db, 'profiles', user.uid), { googlePhotoURL: user.photoURL }, { merge: true })
            setGooglePhotoURL(user.photoURL)
          }
        }
      } finally {
        setProfileLoading(false)
      }
    }
    load()
  }, [user])

  // Escape closes whichever confirm modal is open first, then the whole overlay.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showSignOutModal) {
        setShowSignOutModal(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, showSignOutModal])

  const showProfileMsg = (text: string, ok: boolean) => {
    setProfileMsg({ text, ok })
    if (profileMsgTimer.current) clearTimeout(profileMsgTimer.current)
    profileMsgTimer.current = setTimeout(() => setProfileMsg(null), 3200)
  }

  const showPasswordMsg = (text: string, ok: boolean) => {
    setPasswordMsg({ text, ok })
    if (passwordMsgTimer.current) clearTimeout(passwordMsgTimer.current)
    passwordMsgTimer.current = setTimeout(() => setPasswordMsg(null), 4200)
  }

  const isProfileDirty =
    fullName.trim() !== originalFullName.trim() || university.trim() !== originalUniversity.trim()

  const isPasswordReady =
    currentPassword.length > 0 && newPassword.length >= 6 && confirmPassword.length > 0

  // Set-password flow (Google-only accounts) needs no current password —
  // there isn't one yet.
  const isSetPasswordReady = newPassword.length >= 6 && confirmPassword.length > 0

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !isProfileDirty) return
    if (!fullName.trim()) {
      showProfileMsg('Name cannot be empty', false)
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
      showProfileMsg('Saved', true)
    } catch {
      showProfileMsg('Could not save', false)
    } finally {
      setProfileSaving(false)
    }
  }

  const persistAvatar = async (next: { photoURL: string | null; avatarPreset: string | null }) => {
    if (!user) return
    setAvatarBusy(true)
    try {
      await setDoc(
        doc(db, 'profiles', user.uid),
        { ...next, updatedAt: serverTimestamp() },
        { merge: true },
      )
      setPhotoURL(next.photoURL)
      setAvatarPreset(next.avatarPreset)
    } catch {
      showProfileMsg('Could not update avatar', false)
    } finally {
      setAvatarBusy(false)
    }
  }

  // Switching to the Google photo is instant when we already have a good
  // mirror stored (the normal case). We only fall back to a fresh Google
  // popup re-auth when there's no stored photo yet, since that's the one
  // reliable way to pull it directly from Google the first time.
  const handleUseGooglePhoto = async () => {
    if (!user) return
    if (googlePhotoURL) {
      void persistAvatar({ photoURL: null, avatarPreset: null })
      return
    }
    setAvatarBusy(true)
    try {
      const provider = new GoogleAuthProvider()
      const result = await reauthenticateWithPopup(user, provider)
      const freshGooglePhoto = result.user.photoURL
      await setDoc(
        doc(db, 'profiles', user.uid),
        { photoURL: null, avatarPreset: null, googlePhotoURL: freshGooglePhoto ?? null, updatedAt: serverTimestamp() },
        { merge: true },
      )
      setPhotoURL(null)
      setAvatarPreset(null)
      setGooglePhotoURL(freshGooglePhoto ?? null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (!msg.includes('auth/popup-closed-by-user') && !msg.includes('auth/cancelled-popup-request')) {
        showProfileMsg('Could not fetch your Google photo', false)
      }
    } finally {
      setAvatarBusy(false)
    }
  }

  // Most browsers (Chrome, Firefox, Edge) can't decode HEIC/HEIF in canvas —
  // createImageBitmap silently rejects it, which used to surface as a generic
  // "Upload failed". Catch it up front by name/type so the message actually
  // explains what's wrong instead of guessing.
  const isHeic = (file: File) =>
    /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type)

  const handleAvatarFile = async (file: File) => {
    if (!user) return
    if (isHeic(file)) {
      showProfileMsg('HEIC not supported, try JPG or PNG', false)
      return
    }
    if (!file.type.startsWith('image/')) {
      showProfileMsg('Choose an image file', false)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showProfileMsg('Too big, try under 5 MB', false)
      return
    }
    setAvatarBusy(true)
    try {
      const blob = await resizeToSquare(file, 256)
      const storageRef = ref(storage, `avatars/${user.uid}/avatar_${Date.now()}.jpg`)
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
      const url = await getDownloadURL(storageRef)
      // Intentionally NOT calling updateProfile(user, { photoURL: url }):
      // user.photoURL must keep pointing at the Google account photo so
      // "Use Google photo" can always restore it. Firestore is the source
      // of truth for the in-app avatar.
      await setDoc(
        doc(db, 'profiles', user.uid),
        { photoURL: url, avatarPreset: null, updatedAt: serverTimestamp() },
        { merge: true },
      )
      setPhotoURL(url)
      setAvatarPreset(null)
    } catch {
      showProfileMsg('Upload failed, try a smaller photo', false)
    } finally {
      setAvatarBusy(false)
    }
  }

  const closePasswordForm = () => {
    setShowPasswordForm(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !user.email || !isPasswordReady) return
    if (newPassword !== confirmPassword) {
      showPasswordMsg('Passwords do not match', false)
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
      setShowPasswordForm(false)
      showPasswordMsg('Password updated', true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('auth/wrong-password') || msg.includes('auth/invalid-credential')) {
        showPasswordMsg('Current password is incorrect', false)
      } else if (msg.includes('auth/too-many-requests')) {
        showPasswordMsg('Too many attempts, try again shortly', false)
      } else {
        showPasswordMsg('Could not update password', false)
      }
    } finally {
      setPasswordSaving(false)
    }
  }

  // Google-only accounts have no password yet — this links one via Firebase's
  // EmailAuthProvider credential so the same email can then be used to sign in
  // directly, alongside Google. Linking a credential is a sensitive operation
  // and can demand a recent login; if so, re-auth through the Google popup
  // (their only existing provider) and retry the link once.
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !user.email || !isSetPasswordReady) return
    if (newPassword !== confirmPassword) {
      showPasswordMsg('Passwords do not match', false)
      return
    }
    setPasswordSaving(true)
    try {
      const credential = EmailAuthProvider.credential(user.email, newPassword)
      try {
        await linkWithCredential(user, credential)
      } catch (linkErr) {
        const linkMsg = linkErr instanceof Error ? linkErr.message : ''
        if (!linkMsg.includes('auth/requires-recent-login')) throw linkErr
        const provider = new GoogleAuthProvider()
        await reauthenticateWithPopup(user, provider)
        await linkWithCredential(user, credential)
      }
      await user.reload()
      setUser(auth.currentUser)
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordForm(false)
      showPasswordMsg('Password set — you can now sign in with email too', true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('auth/popup-closed-by-user') || msg.includes('auth/cancelled-popup-request')) {
        // User backed out of the re-auth popup — no error needed.
      } else if (msg.includes('auth/email-already-in-use') || msg.includes('auth/credential-already-in-use')) {
        showPasswordMsg('That email already has a password on another account', false)
      } else if (msg.includes('auth/weak-password')) {
        showPasswordMsg('Choose a stronger password (at least 6 characters)', false)
      } else if (msg.includes('auth/too-many-requests')) {
        showPasswordMsg('Too many attempts, try again shortly', false)
      } else {
        showPasswordMsg('Could not set password', false)
      }
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleSignOut = async () => {
    setShowSignOutModal(false)
    await signOut(auth)
    onClose()
    router.push('/')
    router.refresh()
  }

  const emailProvider = user ? isEmailProvider(user) : false
  const googleProvider = user ? user.providerData.some((p) => p.providerId === 'google.com') : false
  const signInLabel = emailProvider && googleProvider
    ? 'Google + Password'
    : emailProvider
    ? 'Email & Password'
    : 'Google'

  const NAV_ITEMS: Array<{ id: Section; label: string; icon: string }> = [
    { id: 'profile', label: 'Profile', icon: 'person' },
    { id: 'account', label: 'Account', icon: 'mail' },
  ]

  // Avatar resolution, in priority order:
  //   1. explicit preset ('initials' sentinel forces the monogram)
  //   2. uploaded photo (Firestore photoURL)
  //   3. Google account photo — the Firestore MIRROR (googlePhotoURL), not
  //      the live Auth user.photoURL, which can be permanently poisoned by
  //      the old upload bug (see handleUseGooglePhoto)
  //   4. monogram initials
  const usingInitials = avatarPreset === INITIALS_PRESET
  const activePreset = avatarPreset && !usingInitials ? avatarPreset : null
  const resolvedPhoto = usingInitials ? null : photoURL || googlePhotoURL || null
  const monogram = initials(fullName || user?.displayName || null, user?.email ?? null)

  const renderAvatar = (sizeClass: string, fontPx: number) =>
    activePreset ? (
      <PresetAvatarView id={activePreset} className={`block ${sizeClass} [&>svg]:h-full [&>svg]:w-full`} />
    ) : resolvedPhoto ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={resolvedPhoto} alt="" className={`${sizeClass} object-cover`} referrerPolicy="no-referrer" />
    ) : (
      <span
        className={`flex ${sizeClass} items-center justify-center font-semibold text-[#fff8f0]`}
        style={{ ...serifStyle, fontSize: fontPx, background: 'linear-gradient(180deg, #5C4033 0%, #3B2F2F 100%)' }}
      >
        {monogram}
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
        .ccx-flicker { animation: ccx-flicker 2.4s ease-in-out infinite; }
        @keyframes ccx-section-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ccx-section { animation: ccx-section-in 0.26s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes ccx-picker-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ccx-picker { animation: ccx-picker-in 0.24s cubic-bezier(0.22,1,0.36,1) both; }
        @keyframes ccx-status-in {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .ccx-inline-status { animation: ccx-status-in 0.22s ease both; }
        .ccx-input {
          background: transparent;
          border: 1px solid rgba(92,64,51,0.20);
          border-radius: 0;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }
        .ccx-input:focus {
          border-color: #3D5A35;
          box-shadow: 0 0 0 3px rgba(61,90,53,0.10);
        }
        .ccx-input::placeholder { color: rgba(92,64,51,0.38); }
        .ccx-btn-primary {
          background: #3D5A35;
          color: #fff8f0;
          border-radius: 0;
          transition: background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
        }
        .ccx-btn-primary:hover:not(:disabled) {
          background: #33502d;
          transform: translateY(-1px);
          box-shadow: 0 6px 16px -8px rgba(61,90,53,0.5);
        }
        .ccx-btn-primary:disabled {
          background: rgba(92,64,51,0.08);
          color: rgba(92,64,51,0.38);
          cursor: not-allowed;
        }
        .ccx-btn-ghost {
          border: 1px solid rgba(92,64,51,0.24);
          color: #5C4033;
          background: transparent;
          border-radius: 0;
          transition: background-color 0.18s ease, transform 0.18s ease;
        }
        .ccx-btn-ghost:hover:not(:disabled) { background: rgba(92,64,51,0.06); transform: translateY(-1px); }
        .ccx-nav-item {
          color: #5C4033;
          border-radius: 0;
          position: relative;
          transition: background-color 0.18s ease, color 0.18s ease;
        }
        .ccx-nav-item:hover { background: rgba(92,64,51,0.06); }
        .ccx-nav-active { background: rgba(61,90,53,0.10); color: #3D5A35; font-weight: 600; }
        .ccx-nav-active::before {
          content: '';
          position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: #D8B978;
        }
        .ccx-signout {
          color: rgba(92,64,51,0.72);
          border-radius: 0;
          transition: background-color 0.18s ease, color 0.18s ease;
        }
        .ccx-signout:hover { background: rgba(92,64,51,0.07); color: #3B2F2F; }
        .ccx-avatar-frame {
          border: 1px solid rgba(92,64,51,0.18);
          border-radius: 0;
          overflow: hidden;
          position: relative;
          cursor: pointer;
          transition: box-shadow 0.18s ease;
        }
        .ccx-avatar-frame:hover { box-shadow: 0 0 0 2px rgba(61,90,53,0.28); }
        .ccx-avatar-frame .ccx-avatar-edit {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(43,34,24,0.44);
          color: #fff8f0;
          opacity: 0;
          transition: opacity 0.18s ease;
        }
        .ccx-avatar-frame:hover .ccx-avatar-edit { opacity: 1; }
        .ccx-avatar-choice {
          border: 1px solid rgba(92,64,51,0.16);
          border-radius: 0;
          cursor: pointer;
          padding: 0;
          background: transparent;
          transition: transform 0.16s ease, box-shadow 0.16s ease;
        }
        .ccx-avatar-choice:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 16px -10px rgba(43,34,24,0.55); }
        .ccx-avatar-choice-active { box-shadow: 0 0 0 2px #3D5A35; }
        .ccx-avatar-action {
          display: inline-flex; align-items: center; gap: 6px;
          border: 1px solid rgba(92,64,51,0.22);
          background: transparent; color: #5C4033;
          padding: 6px 12px; font-size: 10.5px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.12em; border-radius: 0;
          cursor: pointer;
          transition: background-color 0.18s ease, transform 0.18s ease;
        }
        .ccx-avatar-action:hover { background: rgba(92,64,51,0.06); transform: translateY(-1px); }
        .ccx-scroll::-webkit-scrollbar { width: 5px; }
        .ccx-scroll::-webkit-scrollbar-thumb { background: rgba(92,64,51,0.18); }
        .ccx-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      <div
        className="ccx-profile-panel relative flex w-full max-w-[680px] overflow-hidden bg-[#fff8f0]"
        style={{ height: 'min(478px, calc(100vh - 64px))', fontFamily: "'Work Sans', sans-serif" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center text-[#8a7c6a] text-xl leading-none bg-transparent border-none cursor-pointer hover:bg-[rgba(92,64,51,0.07)] hover:text-[#453a2a] transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        {showSignOutModal ? (
          <SignOutConfirmModal
            onCancel={() => setShowSignOutModal(false)}
            onConfirm={() => void handleSignOut()}
          />
        ) : null}

        {!authReady || profileLoading || !user ? (
          <div className="flex w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Loading" width={52} height={52} className="ccx-flicker" style={{ objectFit: 'contain' }} />
          </div>
        ) : (
          <>
            {/* Left sidebar — same surface as the content, hairline divider */}
            <div className="flex w-[168px] shrink-0 flex-col border-r border-[#5c4033]/12 px-3 py-4 sm:w-[186px]">
              <div className="mb-4 flex items-center gap-2 px-1">
                <div className="h-8 w-8 shrink-0 overflow-hidden border border-[#5c4033]/18">
                  {renderAvatar('h-full w-full', 13)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-[#453a2a]">
                    {fullName || user.displayName || 'Account'}
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-[#3D5A35]/55 font-semibold">
                    Settings
                  </p>
                </div>
              </div>

              <nav className="space-y-0.5">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`ccx-nav-item flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-[12.5px] ${
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

              <div className="mt-auto border-t border-[#5c4033]/12 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSignOutModal(true)}
                  className="ccx-signout flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-[12.5px]"
                >
                  <span className="material-symbols-outlined" style={iconStyle}>
                    logout
                  </span>
                  Sign Out
                </button>
              </div>
            </div>

            {/* Right content — fixed height, scrolls internally */}
            <div className="ccx-scroll flex-1 overflow-y-auto px-6 py-5 sm:px-8">
              {section === 'profile' ? (
                <div className="ccx-section" key="profile">
                  <p className={`${sectionTitleClass} mb-4`} style={serifStyle}>
                    Profile
                  </p>

                  {/* Avatar — click the tile to change it. No explainer copy. */}
                  <div className="mb-4">
                    <p className={labelClass}>Avatar</p>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => setShowAvatarPicker((v) => !v)}
                        className="ccx-avatar-frame h-14 w-14 shrink-0"
                        aria-label="Change avatar"
                      >
                        {renderAvatar('h-full w-full', 20)}
                        <span className="ccx-avatar-edit">
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            {showAvatarPicker ? 'close' : 'edit'}
                          </span>
                        </span>
                      </button>
                      {avatarBusy ? (
                        <span className="text-[11px] text-[#5c4033]/55">Updating...</span>
                      ) : null}
                    </div>

                    {showAvatarPicker ? (
                      <div className="ccx-picker mt-3">
                        {/* 10 tiles (monogram + 9 presets) in 10 columns — a
                            single row, so opening the picker never wraps to an
                            orphan second row or forces the panel to scroll. */}
                        <div className="grid grid-cols-10 gap-2">
                          {/* Monogram tile — explicit "no photo" choice */}
                          <button
                            type="button"
                            title="Initials"
                            disabled={avatarBusy}
                            onClick={() => void persistAvatar({ photoURL: null, avatarPreset: INITIALS_PRESET })}
                            className={`ccx-avatar-choice aspect-square overflow-hidden ${
                              usingInitials || (!activePreset && !resolvedPhoto) ? 'ccx-avatar-choice-active' : ''
                            }`}
                          >
                            <span
                              className="flex h-full w-full items-center justify-center font-semibold text-[#fff8f0]"
                              style={{ ...serifStyle, fontSize: 16, background: 'linear-gradient(180deg, #5C4033 0%, #3B2F2F 100%)' }}
                            >
                              {monogram}
                            </span>
                          </button>
                          {PRESET_AVATARS.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              title={a.label}
                              disabled={avatarBusy}
                              onClick={() => void persistAvatar({ photoURL: null, avatarPreset: a.id })}
                              className={`ccx-avatar-choice aspect-square overflow-hidden ${
                                activePreset === a.id ? 'ccx-avatar-choice-active' : ''
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
                          <label className="ccx-avatar-action cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={avatarBusy}
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) void handleAvatarFile(f)
                                e.currentTarget.value = ''
                              }}
                            />
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                              upload
                            </span>
                            Upload
                          </label>
                          {!emailProvider ? (
                            <button
                              type="button"
                              className="ccx-avatar-action"
                              disabled={avatarBusy}
                              onClick={() => void handleUseGooglePhoto()}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                                account_circle
                              </span>
                              Google photo
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <form onSubmit={handleSaveProfile} className="space-y-3">
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

                    <div className="flex items-center gap-3 pt-1">
                      <SubmitButton disabled={!isProfileDirty || profileSaving}>
                        {profileSaving ? 'Saving...' : 'Save Changes'}
                      </SubmitButton>
                      <InlineStatus status={profileMsg} />
                    </div>
                  </form>
                </div>
              ) : null}

              {section === 'account' ? (
                <div className="ccx-section" key="account">
                  <p className={`${sectionTitleClass} mb-4`} style={serifStyle}>
                    Account
                  </p>
                  <div className="space-y-3">
                    <div>
                      <p className={labelClass}>Email</p>
                      <p className="text-[13.5px] text-[#453a2a] font-medium">{user.email ?? '—'}</p>
                    </div>
                    <div>
                      <p className={labelClass}>Sign-In</p>
                      <p className="flex items-center gap-2 text-[13.5px] text-[#453a2a] font-medium">
                        <span className="material-symbols-outlined text-[#3D5A35]" style={{ fontSize: 16 }}>
                          {emailProvider ? 'key' : 'account_circle'}
                        </span>
                        {signInLabel}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-[#5c4033]/12 pt-4">
                    <button
                      type="button"
                      onClick={() => (showPasswordForm ? closePasswordForm() : setShowPasswordForm(true))}
                      className="group flex w-full items-center justify-between gap-3 py-0.5 text-left transition-opacity hover:opacity-75"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#3D5A35]">
                          {emailProvider ? 'Change Password' : 'Set Password'}
                        </span>
                        <InlineStatus status={passwordMsg} />
                      </span>
                      <span
                        className="material-symbols-outlined shrink-0 text-[#8a7c6a] transition-transform duration-200"
                        style={{ fontSize: 18, transform: showPasswordForm ? 'rotate(180deg)' : 'none' }}
                      >
                        expand_more
                      </span>
                    </button>

                    {showPasswordForm ? (
                      <div className="ccx-picker mt-3">
                        {!emailProvider ? (
                          <p className="mb-3 text-[12px] leading-relaxed text-[#5c4033]/65">
                            Add a password so you can also sign in with {user.email} directly, without Google.
                          </p>
                        ) : null}
                        <form
                          onSubmit={emailProvider ? handleChangePassword : handleSetPassword}
                          className="space-y-3"
                        >
                          {emailProvider ? (
                            <div>
                              <label className={labelClass}>Current Password</label>
                              <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Enter current password"
                                autoComplete="current-password"
                                autoFocus
                                className={fieldClass}
                              />
                            </div>
                          ) : null}
                          <div>
                            <label className={labelClass}>New Password</label>
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="At least 6 characters"
                              autoComplete="new-password"
                              autoFocus={!emailProvider}
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

                          <div className="flex items-center gap-3 pt-1">
                            <SubmitButton
                              disabled={(emailProvider ? !isPasswordReady : !isSetPasswordReady) || passwordSaving}
                            >
                              {passwordSaving
                                ? emailProvider ? 'Updating...' : 'Setting...'
                                : emailProvider ? 'Update Password' : 'Set Password'}
                            </SubmitButton>
                            <button
                              type="button"
                              onClick={closePasswordForm}
                              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5c4033]/55 hover:text-[#5c4033]"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
