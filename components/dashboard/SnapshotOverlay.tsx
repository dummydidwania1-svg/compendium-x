'use client'

import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react'
import { Image, ImageUp, Loader2, X } from 'lucide-react'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { storage, waitForAuthUser } from '@/lib/firebase/config'
import { apiPost } from '@/lib/api/client'
import type { DashboardCaseEntry } from '@/lib/dashboard/live'
import { formatDashboardDateDot } from '@/lib/dashboard/date'

function safeFileExtension(filename: string): string {
  const raw = filename.toLowerCase().split('.').pop() ?? 'jpg'
  const clean = raw.replace(/[^a-z0-9]/g, '')
  return clean || 'jpg'
}

const formatDate = (dateStr: string): string => formatDashboardDateDot(dateStr)

export default function SnapshotOverlay({
  entry,
  onClose,
  onUploaded,
}: {
  entry: DashboardCaseEntry
  onClose: () => void
  onUploaded?: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [localImageUrl, setLocalImageUrl] = useState(entry.workspaceImageUrls[0] ?? '')

  const hasSnapshot = Boolean(localImageUrl || entry.hasSnapshot)

  // Escape closes the modal (matching CaseDetailOverlay/FullHistoryModal), but
  // never mid-upload — a stray Escape must not be mistaken for a cancel while
  // the request is in flight. Focus is restored to the trigger on close.
  const uploadingRef = useRef(uploading)
  uploadingRef.current = uploading
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !uploadingRef.current) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreFocusRef.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const uploadFile = async (file: File | null | undefined) => {
    if (!file || uploading) return

    setError('')
    setSuccess('')

    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image size must be under 10MB.')
      return
    }

    setUploading(true)
    try {
      const user = await waitForAuthUser()
      if (!user) {
        throw new Error('You must be signed in to upload a snapshot.')
      }

      const extension = safeFileExtension(file.name)
      const filePath = `workspace-images/${user.uid}/${entry.evaluationId}/${Date.now()}.${extension}`
      const fileRef = storageRef(storage, filePath)

      await uploadBytes(fileRef, file, { contentType: file.type })
      const downloadUrl = await getDownloadURL(fileRef)

      await apiPost(`/api/evaluations/${encodeURIComponent(entry.evaluationId)}/workspace-image`, {
        storagePath: filePath,
        workspaceImageUrl: downloadUrl,
      })

      setLocalImageUrl(downloadUrl)
      setSuccess('Snapshot uploaded.')
      onUploaded?.(downloadUrl)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Unable to upload snapshot.')
    } finally {
      setUploading(false)
    }
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    void uploadFile(file)
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    void uploadFile(event.dataTransfer.files?.[0])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={hasSnapshot ? 'Workspace snapshot' : 'Upload workspace snapshot'}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[#3B2F2F]/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#5C4033]/12 bg-[#fff8f0]/90 shadow-2xl backdrop-blur-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#5C4033]/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5C4033]/55">
              {hasSnapshot ? 'SNAPSHOT' : 'UPLOAD'}
            </span>
            <span className="shrink-0 text-[10px] text-[#5C4033]/30">.</span>
            <span className="truncate text-xs font-semibold text-[#3B2F2F]">{entry.name}</span>
          </div>
          <button
            onClick={onClose}
            className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D9D0C4]/50 text-[#5C4033] transition-colors hover:bg-[#3B2F2F] hover:text-[#F0EBE3]"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>

        <div className="p-4">
          {hasSnapshot ? (
            <div className="overflow-hidden rounded-lg border border-[#D9D0C4]/70 bg-[#D9D0C4]/20">
              {localImageUrl ? (
                <img
                  src={localImageUrl}
                  alt="Uploaded notes snapshot"
                  className="max-h-[320px] w-full object-contain"
                />
              ) : (
                <div className="flex min-h-[200px] flex-col items-center justify-center p-6">
                  <Image className="mb-2 h-8 w-8 text-[#5C4033]/30" />
                  <p className="text-center text-xs text-[#5C4033]/70">Your handwritten notes snapshot</p>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-[#5C4033]/10 px-3 py-2">
                <p className="text-[10px] text-[#5C4033]/45">Uploaded on {formatDate(entry.date)}</p>
                <label className="cursor-pointer rounded-full border border-[#D7CABA] bg-[#FBF6EF] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5C4033]/70 transition hover:border-[#B7A387] hover:bg-[#F3EBDF] disabled:opacity-60">
                  Replace
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={handleInputChange}
                  />
                </label>
              </div>
            </div>
          ) : (
            <label
              className="block cursor-pointer"
              onDragEnter={() => setDragging(true)}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <div
                className={`flex min-h-[260px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-all duration-200 ${
                  dragging
                    ? 'border-[#3D5A35] bg-[#3D5A35]/8'
                    : 'border-[#3D5A35]/80 bg-[#D9D0C4]/12 hover:border-[#3D5A35] hover:bg-[#3D5A35]/5'
                }`}
              >
                {uploading ? (
                  <Loader2 className="mb-3 h-8 w-8 animate-spin text-[#3D5A35]/70" />
                ) : (
                  <ImageUp className="mb-3 h-8 w-8 text-[#5C4033]/25" />
                )}
                <p className="text-xs font-medium text-[#3B2F2F]/70">
                  {uploading ? 'Uploading snapshot...' : 'Drop your snapshot here'}
                </p>
                <p className="mt-1 text-[10px] text-[#5C4033]/40">
                  {uploading ? 'This usually takes a few seconds' : 'or click to browse files'}
                </p>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={handleInputChange}
              />
            </label>
          )}

          {error ? <p className="mt-3 text-xs font-medium text-[#92400e]">{error}</p> : null}
          {success ? <p className="mt-3 text-xs font-medium text-[#3D5A35]">{success}</p> : null}
        </div>
      </div>
    </div>
  )
}
