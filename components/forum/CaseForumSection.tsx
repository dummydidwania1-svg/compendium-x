'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { User } from 'firebase/auth'
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs,
  increment, serverTimestamp, setDoc, updateDoc, type Timestamp,
} from 'firebase/firestore'
import { db, waitForAuthUser } from '@/lib/firebase/config'

/* ── Types ──────────────────────────────────────────────────────── */

type ThreadDoc = {
  body?: string; title?: string; authorId?: string; authorName?: string
  createdAt?: Timestamp; updatedAt?: Timestamp; editedAt?: Timestamp; voteScore?: number
}
type ReplyDoc = {
  body?: string; authorId?: string; authorName?: string
  createdAt?: Timestamp; updatedAt?: Timestamp; voteScore?: number
}
type Thread = {
  id: string; body: string; authorId: string | null; authorName: string
  createdAt?: Timestamp; updatedAt?: Timestamp; editedAt?: Timestamp; voteScore: number
}
type Reply = {
  id: string; body: string; authorId: string | null; authorName: string
  createdAt?: Timestamp; updatedAt?: Timestamp; voteScore: number
}

/* ── Helpers ────────────────────────────────────────────────────── */

function ms(t?: Timestamp) { return t?.toMillis?.() ?? 0 }

function ago(t?: Timestamp): string {
  if (!t) return ''
  const s = (Date.now() - t.toDate().getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return t.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Platform-harmonic palette: sage greens, warm taupes, dusty mauves, slate blues, terracotta
const AVATAR_PALETTE = [
  '#4A7C59', '#5C7A4E', '#7A8C5A', '#3D6B5A',  // sage greens
  '#8B7355', '#A08060', '#7A6048', '#6B5040',  // warm taupes
  '#7A6B8A', '#8B7A9A', '#6B6080',             // dusty mauves
  '#5A7080', '#6A8090', '#507060',             // slate-teal
  '#8B5A4A', '#9A6B55', '#7A4F40',             // terracotta
]
function avatarColor(name: string): string {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}
function initials(name: string): string {
  return (name || '').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('') || '?'
}
function mapThread(id: string, d: ThreadDoc): Thread {
  return {
    id, body: (d.body?.trim() || d.title?.trim() || ''),
    authorId: typeof d.authorId === 'string' ? d.authorId : null,
    authorName: d.authorName?.trim() || 'Anonymous',
    createdAt: d.createdAt, updatedAt: d.updatedAt, editedAt: d.editedAt,
    voteScore: typeof d.voteScore === 'number' ? d.voteScore : 0,
  }
}
function mapReply(id: string, d: ReplyDoc): Reply {
  return {
    id, body: d.body ?? '',
    authorId: typeof d.authorId === 'string' ? d.authorId : null,
    authorName: d.authorName?.trim() || 'Anonymous',
    createdAt: d.createdAt, updatedAt: d.updatedAt,
    voteScore: typeof d.voteScore === 'number' ? d.voteScore : 0,
  }
}
function friendlyErr(e: unknown, fb: string): string {
  const m = e instanceof Error ? e.message : fb
  return m.includes('Missing or insufficient permissions') ? 'Permission denied.' : m
}

// Collect unique author names excluding the current user (can't tag yourself)
function collectAuthors(threads: Thread[], replies: Record<string, Reply[]>, selfName: string): string[] {
  const set = new Set<string>()
  threads.forEach(t => { if (t.authorName !== 'Anonymous' && t.authorName !== selfName) set.add(t.authorName) })
  Object.values(replies).flat().forEach(r => { if (r.authorName !== 'Anonymous' && r.authorName !== selfName) set.add(r.authorName) })
  return Array.from(set).sort()
}

/* ── Avatar ─────────────────────────────────────────────────────── */

function Avatar({ name, px = 28 }: { name: string; px?: number }) {
  return (
    <div className="shrink-0 rounded-full flex items-center justify-center font-semibold select-none"
      style={{
        width: px, height: px,
        background: avatarColor(name),
        fontSize: px <= 20 ? 7.5 : px <= 24 ? 8.5 : px <= 28 ? 10 : 11,
        color: 'rgba(255,248,240,0.92)',
        letterSpacing: '0.02em',
      }}>
      {initials(name)}
    </div>
  )
}

/* ── @Mention helpers ───────────────────────────────────────────── */

function detectMention(value: string, cursor: number): { query: string; start: number } | null {
  const before = value.slice(0, cursor)
  const m = before.match(/@(\w*)$/)
  if (!m) return null
  return { query: m[1], start: cursor - m[0].length }
}

function applyMention(value: string, mention: { query: string; start: number }, name: string): { next: string; cursor: number } {
  const before = value.slice(0, mention.start)
  const after = value.slice(mention.start + 1 + mention.query.length)
  const tag = name.split(' ')[0]
  const next = `${before}@${tag} ${after}`
  return { next, cursor: mention.start + tag.length + 2 }
}

/* ── MentionDropdown — portalled to body so nothing clips it ────── */

function MentionDropdown({ names, anchorRef, onPick }: {
  names: string[]
  anchorRef: React.RefObject<HTMLTextAreaElement | null>
  onPick: (n: string) => void
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const update = () => setRect(el.getBoundingClientRect())
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorRef])

  if (!rect || typeof document === 'undefined') return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        zIndex: 99999,
        animation: 'forum-drop 0.22s cubic-bezier(0.16,1,0.3,1) both',
        minWidth: rect.width > 200 ? 200 : rect.width,
      }}
      className="w-48 rounded-xl border border-[#3D5A35]/12 bg-[#fff8f0] shadow-[0_12px_32px_rgba(59,47,47,0.14)] overflow-hidden">
      {names.length === 0 ? (
        <div className="px-3 py-2.5 text-[11.5px] text-[#5C4033]/38 italic">No one to tag yet</div>
      ) : names.map(n => (
        <button key={n} onMouseDown={e => { e.preventDefault(); onPick(n) }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[#3D5A35]/6 transition-colors">
          <Avatar name={n} px={20} />
          <span className="text-[12px] font-medium text-[#3B2F2F]/80 truncate">{n}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}

/* ── Main Component ─────────────────────────────────────────────── */

export function CaseForumSection({ caseId, caseTitle }: { caseId: string; caseTitle?: string }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState<string>('')
  const [threads, setThreads] = useState<Thread[]>([])
  const [replies, setReplies] = useState<Record<string, Reply[]>>({})
  const [votes, setVotes] = useState<Record<string, number>>({})
  const [replyVotes, setReplyVotes] = useState<Record<string, number>>({}) // "threadId:replyId" -> -1|0|1
  const [replyScores, setReplyScores] = useState<Record<string, number>>({}) // same key -> score
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [composing, setComposing] = useState(false)
  const [posting, setPosting] = useState(false)
  const [openReplyId, setOpenReplyId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [postingReply, setPostingReply] = useState<string | null>(null)
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null)
  const [editingReplyKey, setEditingReplyKey] = useState<string | null>(null) // "threadId:replyId"
  const [editDraft, setEditDraft] = useState('')
  const [savingEdit, setSavingEdit] = useState<string | null>(null)

  const login = useCallback(() =>
    router.push(`/login?redirect=${encodeURIComponent(`/case/${caseId}/interviewer?preview=1&tab=forum`)}`),
    [router, caseId])

  const resolveAuthorName = useCallback(async (u: User) => {
    const s = await getDoc(doc(db, 'profiles', u.uid))
    const d = s.exists() ? s.data() : null
    return (typeof d?.fullName === 'string' && d.fullName.trim()) ? d.fullName.trim() : u.email ?? 'Member'
  }, [])

  const loadAll = useCallback(async (u: User | null) => {
    setLoading(true); setError('')
    try {
      const snap = await getDocs(collection(db, 'case_forums', caseId, 'threads'))
      const rows = snap.docs.map(d => mapThread(d.id, d.data() as ThreadDoc))
      rows.sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
      setThreads(rows)
      const rAll = await Promise.all(rows.map(async t => {
        try {
          const rs = await getDocs(collection(db, 'case_forums', caseId, 'threads', t.id, 'replies'))
          const mapped = rs.docs.map(d => mapReply(d.id, d.data() as ReplyDoc))
          mapped.sort((a, b) => ms(a.createdAt) - ms(b.createdAt))
          return [t.id, mapped] as const
        } catch { return [t.id, []] as const }
      }))
      const replyMap = Object.fromEntries(rAll)
      setReplies(replyMap)

      // Build reply score map from voteScore on each reply doc
      const allReplies = Object.entries(replyMap).flatMap(([tid, rs]) => (rs as Reply[]).map(r => ({ tid, r })))
      setReplyScores(Object.fromEntries(allReplies.map(({ tid, r }) => [`${tid}:${r.id}`, r.voteScore])))

      if (u) {
        const vAll = await Promise.all(rows.map(async t => {
          const vs = await getDoc(doc(db, 'case_forums', caseId, 'threads', t.id, 'votes', u.uid))
          const v = vs.data()?.value; return [t.id, v === 1 || v === -1 ? v : 0] as const
        })).catch(() => [])
        setVotes(Object.fromEntries(vAll))

        const rvAll = await Promise.all(allReplies.map(async ({ tid, r }) => {
          try {
            const vs = await getDoc(doc(db, 'case_forums', caseId, 'threads', tid, 'replies', r.id, 'votes', u.uid))
            const v = vs.data()?.value; return [`${tid}:${r.id}`, v === 1 || v === -1 ? v : 0] as const
          } catch { return [`${tid}:${r.id}`, 0] as const }
        })).catch(() => [])
        setReplyVotes(Object.fromEntries(rvAll))
      } else { setVotes({}); setReplyVotes({}) }
    } catch (e) { setError(friendlyErr(e, 'Could not load forum.')) }
    finally { setLoading(false) }
  }, [caseId])

  useEffect(() => {
    waitForAuthUser().then(async u => {
      setUser(u)
      if (u) {
        const name = await resolveAuthorName(u)
        setDisplayName(name)
      }
      loadAll(u)
    })
  }, [loadAll, resolveAuthorName])

  const authors = collectAuthors(threads, replies, displayName)

  const handlePost = async () => {
    if (!user) { login(); return }
    const body = draft.trim(); if (!body) return
    setPosting(true); setError('')
    try {
      const name = displayName || await resolveAuthorName(user)
      await addDoc(collection(db, 'case_forums', caseId, 'threads'), {
        caseId, caseTitle: caseTitle ?? null, body,
        authorId: user.uid, authorName: name,
        voteScore: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      await setDoc(doc(db, 'case_forums', caseId),
        { caseId, caseTitle: caseTitle ?? null, updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp(), threadCount: increment(1) },
        { merge: true })
      setDraft(''); setComposing(false); await loadAll(user)
    } catch (e) { setError(friendlyErr(e, 'Could not post.')) }
    finally { setPosting(false) }
  }

  const handleReply = async (threadId: string) => {
    if (!user) { login(); return }
    const body = replyDraft.trim(); if (!body) return
    setPostingReply(threadId); setError('')
    try {
      const name = displayName || await resolveAuthorName(user)
      await addDoc(collection(db, 'case_forums', caseId, 'threads', threadId, 'replies'),
        { body, authorId: user.uid, authorName: name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
      await updateDoc(doc(db, 'case_forums', caseId, 'threads', threadId), { lastReplyAt: serverTimestamp() })
      setReplyDraft(''); setOpenReplyId(null); await loadAll(user)
    } catch (e) { setError(friendlyErr(e, 'Could not reply.')) }
    finally { setPostingReply(null) }
  }

  const handleVote = async (threadId: string, next: 1 | -1) => {
    if (!user) { login(); return }
    const prev = votes[threadId] ?? 0
    const nv = prev === next ? 0 : next; const delta = nv - prev
    setVotes(c => ({ ...c, [threadId]: nv }))
    setThreads(r => r.map(t => t.id === threadId ? { ...t, voteScore: t.voteScore + delta } : t))
    try {
      const ref = doc(db, 'case_forums', caseId, 'threads', threadId, 'votes', user.uid)
      if (nv === 0) await deleteDoc(ref)
      else await setDoc(ref, { value: nv, updatedAt: serverTimestamp() }, { merge: true })
      await updateDoc(doc(db, 'case_forums', caseId, 'threads', threadId), { voteScore: increment(delta) })
    } catch (e) {
      setVotes(c => ({ ...c, [threadId]: prev }))
      setThreads(r => r.map(t => t.id === threadId ? { ...t, voteScore: t.voteScore - delta } : t))
      setError(friendlyErr(e, 'Vote failed.'))
    }
  }

  const handleSaveThreadEdit = async (threadId: string) => {
    const body = editDraft.trim(); if (!body) return
    setSavingEdit(threadId); setError('')
    try {
      await updateDoc(doc(db, 'case_forums', caseId, 'threads', threadId), { body, editedAt: serverTimestamp() })
      setEditingThreadId(null); setEditDraft(''); await loadAll(user)
    } catch (e) { setError(friendlyErr(e, 'Could not save.')) }
    finally { setSavingEdit(null) }
  }

  const handleSaveReplyEdit = async (threadId: string, replyId: string) => {
    const body = editDraft.trim(); if (!body) return
    const key = `${threadId}:${replyId}`
    setSavingEdit(key); setError('')
    try {
      await updateDoc(doc(db, 'case_forums', caseId, 'threads', threadId, 'replies', replyId), { body, updatedAt: serverTimestamp() })
      setReplies(r => ({ ...r, [threadId]: (r[threadId] ?? []).map(x => x.id === replyId ? { ...x, body } : x) }))
      setEditingReplyKey(null); setEditDraft('')
    } catch (e) { setError(friendlyErr(e, 'Could not save.')) }
    finally { setSavingEdit(null) }
  }

  const handleDeleteThread = async (threadId: string) => {
    if (!confirm('Delete this post?')) return
    try {
      await deleteDoc(doc(db, 'case_forums', caseId, 'threads', threadId))
      setThreads(r => r.filter(t => t.id !== threadId))
    } catch (e) { setError(friendlyErr(e, 'Could not delete.')) }
  }

  const handleDeleteReply = async (threadId: string, replyId: string) => {
    if (!confirm('Delete this reply?')) return
    try {
      await deleteDoc(doc(db, 'case_forums', caseId, 'threads', threadId, 'replies', replyId))
      setReplies(r => ({ ...r, [threadId]: (r[threadId] ?? []).filter(x => x.id !== replyId) }))
    } catch (e) { setError(friendlyErr(e, 'Could not delete.')) }
  }

  const handleReplyVote = async (threadId: string, replyId: string, next: 1 | -1) => {
    if (!user) { login(); return }
    const key = `${threadId}:${replyId}`
    const prev = replyVotes[key] ?? 0
    const nv = prev === next ? 0 : next; const delta = nv - prev
    setReplyVotes(c => ({ ...c, [key]: nv }))
    setReplyScores(c => ({ ...c, [key]: (c[key] ?? 0) + delta }))
    try {
      const ref = doc(db, 'case_forums', caseId, 'threads', threadId, 'replies', replyId, 'votes', user.uid)
      if (nv === 0) await deleteDoc(ref)
      else await setDoc(ref, { value: nv, updatedAt: serverTimestamp() }, { merge: true })
      await updateDoc(doc(db, 'case_forums', caseId, 'threads', threadId, 'replies', replyId), { voteScore: increment(delta) })
    } catch (e) {
      setReplyVotes(c => ({ ...c, [key]: prev }))
      setReplyScores(c => ({ ...c, [key]: (c[key] ?? 0) - delta }))
      setError(friendlyErr(e, 'Vote failed.'))
    }
  }

  const threadCount = threads.length

  return (
    <>
      <style>{`
        @keyframes forum-rise {
          from { opacity:0; transform:translateY(16px); filter:blur(5px) }
          to   { opacity:1; transform:translateY(0);    filter:blur(0) }
        }
        @keyframes forum-drop {
          from { opacity:0; transform:translateY(-8px); filter:blur(3px) }
          to   { opacity:1; transform:translateY(0);    filter:blur(0) }
        }
        @keyframes forum-pop {
          0%   { transform:scale(1) }
          35%  { transform:scale(1.32) }
          65%  { transform:scale(0.92) }
          100% { transform:scale(1) }
        }
        @keyframes forum-empty-breathe {
          0%,100% { opacity:0.32 }
          50%      { opacity:0.52 }
        }
        @keyframes forum-quill-float {
          0%,100% { transform: translateY(0px) rotate(-18deg) }
          50%      { transform: translateY(-4px) rotate(-14deg) }
        }
        @keyframes forum-quill-line {
          0%   { width: 0%; opacity:0 }
          40%  { opacity:1 }
          100% { width: 60%; opacity:0.18 }
        }
        @keyframes forum-shimmer {
          0%   { transform: translateX(-100%) }
          100% { transform: translateX(200%) }
        }
        .f-rise  { animation: forum-rise 0.56s cubic-bezier(0.16,1,0.3,1) both }
        .f-drop  { animation: forum-drop 0.38s cubic-bezier(0.16,1,0.3,1) both }
        .f-pop   { animation: forum-pop  0.32s cubic-bezier(0.34,1.56,0.64,1) }
        .f-row   { border-radius:12px; transition: background 0.22s cubic-bezier(0.16,1,0.3,1), box-shadow 0.22s cubic-bezier(0.16,1,0.3,1) }
        .f-row:hover { background: rgba(61,90,53,0.035); box-shadow: inset 0 -1px 0 rgba(61,90,53,0.06) }
        .f-row + .f-row { box-shadow: inset 0 1px 0 rgba(61,90,53,0.055) }
        .f-ghost { opacity:0; transition: opacity 0.22s cubic-bezier(0.16,1,0.3,1), transform 0.22s cubic-bezier(0.16,1,0.3,1); transform:translateX(-2px) }
        .f-row:hover .f-ghost, .f-row:focus-within .f-ghost { opacity:1; transform:translateX(0) }
        .f-reply-ghost { opacity:0; transition: opacity 0.18s ease, transform 0.18s ease; transform:translateX(-2px) }
        .f-reply-row:hover .f-reply-ghost { opacity:1; transform:translateX(0) }
        .f-btn   { transition: color 0.2s cubic-bezier(0.16,1,0.3,1), background 0.2s cubic-bezier(0.16,1,0.3,1), transform 0.2s cubic-bezier(0.16,1,0.3,1) }
        .f-btn:hover { transform:scale(1.08) }
        .f-input { transition: border-color 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s cubic-bezier(0.16,1,0.3,1), background 0.25s ease }
        .f-input:focus { border-color:rgba(61,90,53,0.3) !important; box-shadow:0 0 0 3px rgba(61,90,53,0.07), 0 1px 4px rgba(61,90,53,0.06) }
        .f-score { transition: color 0.2s cubic-bezier(0.16,1,0.3,1) }
        .f-mention { color: #3D5A35; font-weight: 500 }
        .f-composer-line { transition: border-color 0.3s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s cubic-bezier(0.16,1,0.3,1) }
        .f-composer-wrap:hover .f-composer-line { border-color: rgba(61,90,53,0.2) !important; box-shadow: 0 1px 0 rgba(61,90,53,0.08) }
        .f-edited { display:inline-flex; align-items:center; gap:2px; opacity:0.4; transition: opacity 0.2s ease }
        .f-edited:hover { opacity:0.7 }
        .f-reply-line { transition: opacity 0.3s ease }
        .f-row:hover .f-reply-line { opacity: 0.28 }
      `}</style>

      <div className="rounded-2xl border border-[#3D5A35]/10 bg-[rgba(255,248,240,0.8)] shadow-[0_4px_12px_rgba(59,47,47,0.04)] backdrop-blur-[16px]">

        {/* ── Top bar ── */}
        <div className="flex items-baseline gap-2 px-6 py-4">
          <span className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#5C4033]/40">Discussion</span>
          {!loading && threadCount > 0 && (
            <span className="text-[11px] text-[#5C4033]/25 tabular-nums">·&nbsp;{threadCount}</span>
          )}
        </div>

        {/* ── Content ── */}
        <div className="flex flex-col gap-2 px-6 pb-5">

          {/* Composer */}
          <Composer
            user={user} displayName={displayName} draft={draft} setDraft={setDraft}
            composing={composing} setComposing={setComposing}
            posting={posting} onPost={handlePost} onLogin={login}
            authors={authors}
          />

          {error && (
            <div className="f-drop flex items-center gap-2 rounded-lg border border-[#b4543e]/15 bg-[rgba(255,244,239,0.9)] px-3.5 py-2.5">
              <span className="h-1 w-1 shrink-0 rounded-full bg-[#b4543e]" />
              <span className="flex-1 text-[11.5px] text-[#92400e]">{error}</span>
              <button onClick={() => setError('')} className="text-[#92400e]/40 hover:text-[#92400e] transition-colors text-[11px]">✕</button>
            </div>
          )}

          {loading ? (
            <div className="relative my-3 h-px overflow-hidden rounded-full bg-[#3D5A35]/8">
              <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-[#3D5A35]/25 to-transparent"
                style={{ animation: 'forum-shimmer 1.6s cubic-bezier(0.4,0,0.6,1) infinite' }} />
            </div>
          ) : threads.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-0">
              {threads.map((t, i) => (
                <ThreadRow
                  key={t.id} thread={t}
                  myVote={votes[t.id] ?? 0}
                  threadReplies={replies[t.id] ?? []}
                  currentUid={user?.uid ?? null}
                  replyOpen={openReplyId === t.id}
                  replyDraft={replyDraft} setReplyDraft={setReplyDraft}
                  postingReply={postingReply === t.id}
                  isEditingThread={editingThreadId === t.id}
                  editingReplyKey={editingReplyKey}
                  editDraft={editDraft} setEditDraft={setEditDraft}
                  savingEdit={savingEdit}
                  delay={i * 60}
                  authors={authors}
                  onVote={v => handleVote(t.id, v)}
                  onToggleReply={() => {
                    if (!user) { login(); return }
                    setOpenReplyId(p => p === t.id ? null : t.id)
                    setReplyDraft('')
                  }}
                  onPostReply={() => handleReply(t.id)}
                  onStartThreadEdit={() => { setEditingThreadId(t.id); setEditDraft(t.body) }}
                  onCancelThreadEdit={() => { setEditingThreadId(null); setEditDraft('') }}
                  onSaveThreadEdit={() => handleSaveThreadEdit(t.id)}
                  onDeleteThread={() => handleDeleteThread(t.id)}
                  onStartReplyEdit={(replyId, body) => { setEditingReplyKey(`${t.id}:${replyId}`); setEditDraft(body) }}
                  onCancelReplyEdit={() => { setEditingReplyKey(null); setEditDraft('') }}
                  onSaveReplyEdit={(replyId) => handleSaveReplyEdit(t.id, replyId)}
                  onDeleteReply={(replyId) => handleDeleteReply(t.id, replyId)}
                  replyVotes={replyVotes} replyScores={replyScores}
                  onReplyVote={(replyId, v) => handleReplyVote(t.id, replyId, v)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ── Empty State ────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <div className="f-rise flex flex-col items-center gap-3 py-6">
      <div className="flex items-center justify-center">
        <svg
          width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke="#3D5A35" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          style={{ animation: 'forum-quill-float 3s ease-in-out infinite', opacity: 0.45 }}
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p className="text-[12px] text-[#5C4033]/38 tracking-wide"
        style={{ animation: 'forum-empty-breathe 3.5s ease-in-out infinite' }}>
        No posts yet. Start the thread.
      </p>
    </div>
  )
}

/* ── Render body text with @mention highlighting ────────────────── */

function BodyText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(@\w+)/g)
  return (
    <p className={className}>
      {parts.map((p, i) =>
        p.startsWith('@')
          ? <span key={i} className="f-mention">{p}</span>
          : p
      )}
    </p>
  )
}

/* ── Composer ───────────────────────────────────────────────────── */

function Composer({ user, displayName, draft, setDraft, composing, setComposing, posting, onPost, onLogin, authors }: {
  user: User | null; displayName: string; draft: string; setDraft: (v: string) => void
  composing: boolean; setComposing: (v: boolean) => void
  posting: boolean; onPost: () => void; onLogin: () => void
  authors: string[]
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const expanded = composing || draft.length > 0
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null)

  useEffect(() => {
    const el = taRef.current; if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft, expanded])

  const authorName = displayName || user?.displayName || user?.email || 'Me'

  const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setDraft(v)
    const cur = e.target.selectionStart ?? v.length
    setMention(detectMention(v, cur))
  }

  const pickMention = (name: string) => {
    if (!mention) return
    const { next, cursor } = applyMention(draft, mention, name)
    setDraft(next); setMention(null)
    setTimeout(() => {
      const el = taRef.current; if (!el) return
      el.setSelectionRange(cursor, cursor); el.focus()
    }, 0)
  }

  const filtered = mention ? authors.filter(a => a.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6) : []

  if (!user) {
    return (
      <button onClick={onLogin}
        className="group flex w-full items-center gap-3 py-1.5 text-left">
        <Avatar name="?" px={24} />
        <span className="flex-1 border-b border-[#3D5A35]/10 pb-2 text-[13px] text-[#5C4033]/32 transition-colors group-hover:text-[#5C4033]/52">
          Sign in to post
        </span>
      </button>
    )
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <Avatar name={authorName} px={24} />
        </div>
        <div className="f-composer-wrap flex-1">
          <textarea
            ref={taRef} value={draft}
            onChange={onTextChange}
            onFocus={() => setComposing(true)}
            onBlur={() => { if (!draft.trim()) setComposing(false); setTimeout(() => setMention(null), 150) }}
            onKeyDown={e => { if (e.key === 'Escape') setMention(null) }}
            placeholder="What's your take?"
            rows={1}
            className="f-composer-line w-full resize-none bg-transparent text-[13px] leading-[1.65] text-[#3B2F2F] outline-none placeholder:text-[#5C4033]/30 border-b pb-2"
            style={{
              minHeight: '28px',
              borderColor: composing || draft.length > 0 ? 'rgba(61,90,53,0.28)' : 'rgba(61,90,53,0.10)',
            }}
          />
          {mention && <MentionDropdown names={filtered} anchorRef={taRef} onPick={pickMention} />}
          {expanded && (
            <div className="f-drop flex items-center justify-end gap-2 pt-2">
              <button onClick={() => { setDraft(''); setComposing(false) }}
                className="text-[11px] text-[#5C4033]/35 hover:text-[#5C4033]/60 transition-colors">
                Cancel
              </button>
              <button onClick={onPost} disabled={posting || !draft.trim()}
                className="rounded-full bg-[#3D5A35] px-3.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#fff8f0] transition hover:bg-[#31492c] disabled:cursor-not-allowed disabled:opacity-40">
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Thread Row ─────────────────────────────────────────────────── */

function ThreadRow({
  thread, myVote, threadReplies, currentUid,
  replyOpen, replyDraft, setReplyDraft, postingReply,
  isEditingThread, editingReplyKey, editDraft, setEditDraft, savingEdit, delay,
  authors, replyVotes, replyScores,
  onVote, onToggleReply, onPostReply,
  onStartThreadEdit, onCancelThreadEdit, onSaveThreadEdit, onDeleteThread,
  onStartReplyEdit, onCancelReplyEdit, onSaveReplyEdit, onDeleteReply,
  onReplyVote,
}: {
  thread: Thread; myVote: number; threadReplies: Reply[]; currentUid: string | null
  replyOpen: boolean; replyDraft: string; setReplyDraft: (v: string) => void; postingReply: boolean
  isEditingThread: boolean; editingReplyKey: string | null
  editDraft: string; setEditDraft: (v: string) => void; savingEdit: string | null; delay: number
  authors: string[]; replyVotes: Record<string, number>; replyScores: Record<string, number>
  onVote: (v: 1 | -1) => void; onToggleReply: () => void; onPostReply: () => void
  onStartThreadEdit: () => void; onCancelThreadEdit: () => void; onSaveThreadEdit: () => void; onDeleteThread: () => void
  onStartReplyEdit: (replyId: string, body: string) => void; onCancelReplyEdit: () => void
  onSaveReplyEdit: (replyId: string) => void; onDeleteReply: (replyId: string) => void
  onReplyVote: (replyId: string, v: 1 | -1) => void
}) {
  const isOwner = !!(currentUid && thread.authorId === currentUid)
  const [pop, setPop] = useState<1 | -1 | null>(null)
  const replyCount = threadReplies.length
  const edited = !!thread.editedAt
  const replyTaRef = useRef<HTMLTextAreaElement>(null)
  const [rMention, setRMention] = useState<{ query: string; start: number } | null>(null)

  const onReplyTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setReplyDraft(v)
    const cur = e.target.selectionStart ?? v.length
    setRMention(detectMention(v, cur))
  }

  const rPickMention = (name: string) => {
    if (!rMention) return
    const { next, cursor } = applyMention(replyDraft, rMention, name)
    setReplyDraft(next); setRMention(null)
    setTimeout(() => {
      const el = replyTaRef.current; if (!el) return
      el.setSelectionRange(cursor, cursor); el.focus()
    }, 0)
  }

  const rFiltered = rMention ? authors.filter(a => a.toLowerCase().includes(rMention.query.toLowerCase())).slice(0, 6) : []

  const vote = (v: 1 | -1) => {
    setPop(v); setTimeout(() => setPop(null), 280); onVote(v)
  }

  return (
    <div className="f-rise f-row px-3 py-4 -mx-3" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex gap-4">

        {/* ── Vote rail ── */}
        <div className="flex w-5 shrink-0 flex-col items-center gap-0.5 pt-0.5">
          <button onClick={() => vote(1)} aria-label="Upvote"
            className={`f-btn flex h-5 w-5 items-center justify-center rounded ${
              myVote === 1 ? 'text-[#3D5A35]' : 'text-[#5C4033]/22 hover:text-[#3D5A35]'
            } ${pop === 1 ? 'f-pop' : ''}`}>
            <svg viewBox="0 0 10 10" className="h-[9px] w-[9px]" fill="currentColor">
              <path d="M5 1.5 1.5 6h7z"/>
            </svg>
          </button>
          <span className={`text-[10.5px] font-semibold tabular-nums leading-tight ${
            myVote === 1 ? 'text-[#3D5A35]' : myVote === -1 ? 'text-[#b4543e]' : 'text-[#5C4033]/38'
          }`}>
            {thread.voteScore}
          </span>
          <button onClick={() => vote(-1)} aria-label="Downvote"
            className={`f-btn flex h-5 w-5 items-center justify-center rounded ${
              myVote === -1 ? 'text-[#b4543e]' : 'text-[#5C4033]/22 hover:text-[#b4543e]'
            } ${pop === -1 ? 'f-pop' : ''}`}>
            <svg viewBox="0 0 10 10" className="h-[9px] w-[9px]" fill="currentColor">
              <path d="M5 8.5 1.5 4h7z"/>
            </svg>
          </button>
        </div>

        {/* ── Content ── */}
        <div className="min-w-0 flex-1">

          {/* Meta row */}
          <div className="flex items-center gap-2 mb-1.5">
            <Avatar name={thread.authorName} px={20} />
            <span className="text-[11.5px] font-semibold text-[#3B2F2F]/72">{thread.authorName}</span>
            <span className="text-[9px] text-[#5C4033]/25 select-none">·</span>
            <span className="text-[11px] text-[#5C4033]/38">{ago(thread.updatedAt ?? thread.createdAt)}</span>
            {edited && (
              <span className="f-edited" title="edited">
                <svg viewBox="0 0 10 10" className="h-[8px] w-[8px] text-[#5C4033]/50" fill="none">
                  <path d="M1 9l.8-2.8L7 1l1.8 1.8-5.2 5.2L1 9z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            )}
          </div>

          {/* Body / edit textarea */}
          {isEditingThread ? (
            <div className="mt-1">
              <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={3} autoFocus
                className="f-input w-full resize-none rounded-lg border border-[#3D5A35]/12 bg-[rgba(255,248,240,0.6)] px-3.5 py-2.5 text-[13.5px] leading-[1.6] text-[#3B2F2F] outline-none" />
              <div className="mt-2.5 flex items-center gap-2">
                <button onClick={onSaveThreadEdit} disabled={savingEdit === thread.id || !editDraft.trim()}
                  className="rounded-full bg-[#3D5A35] px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#fff8f0] hover:bg-[#31492c] disabled:opacity-40 transition">
                  {savingEdit === thread.id ? 'Saving…' : 'Save'}
                </button>
                <button onClick={onCancelThreadEdit} className="text-[11.5px] text-[#5C4033]/40 hover:text-[#5C4033] transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <BodyText text={thread.body} className="text-[13.5px] leading-[1.65] text-[#3B2F2F]/80 whitespace-pre-wrap" />
          )}

          {/* Action row */}
          {!isEditingThread && (
            <div className="mt-2.5 flex items-center gap-4">
              <button onClick={onToggleReply}
                className="flex items-center gap-1.5 text-[11px] font-medium text-[#5C4033]/38 transition hover:text-[#3D5A35]">
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                  <path d="M4.5 3L2 5.5 4.5 8M2.2 5.5H8C9.1 5.5 10 6.4 10 7.5V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {replyCount > 0 ? `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}` : 'Reply'}
              </button>
              {isOwner && (
                <div className="f-ghost flex items-center gap-0.5">
                  <button onClick={onStartThreadEdit} aria-label="Edit"
                    className="f-btn flex h-6 w-6 items-center justify-center rounded text-[#5C4033]/28 hover:bg-[#3D5A35]/8 hover:text-[#3D5A35]/70">
                    <svg viewBox="0 0 12 12" className="h-[10px] w-[10px]" fill="none">
                      <path d="M1.5 10.5l1-3.5 6-6 2.5 2.5-6 6-3.5 1z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button onClick={onDeleteThread} aria-label="Delete"
                    className="f-btn flex h-6 w-6 items-center justify-center rounded text-[#5C4033]/28 hover:bg-[#b4543e]/8 hover:text-[#b4543e]/70">
                    <svg viewBox="0 0 12 12" className="h-[10px] w-[10px]" fill="none">
                      <path d="M2 3.5h8M4.5 3.5V2.5h3V3.5M3 3.5l.5 7h5l.5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Reply composer */}
          {replyOpen && !isEditingThread && (
            <div className="f-drop mt-3 flex gap-3">
              <div className="f-reply-line mt-0.5 w-px shrink-0 self-stretch rounded-full bg-gradient-to-b from-[#3D5A35]/22 to-transparent" style={{ opacity: 0.22 }} />
              <div className="flex-1">
                <textarea ref={replyTaRef} value={replyDraft}
                  onChange={onReplyTextChange}
                  onBlur={() => setTimeout(() => setRMention(null), 150)}
                  onKeyDown={e => { if (e.key === 'Escape') setRMention(null) }}
                  placeholder="Write a reply… type @ to mention"
                  rows={2} autoFocus
                  className="f-input w-full resize-none rounded-lg border border-[#3D5A35]/12 bg-[rgba(255,248,240,0.55)] px-3.5 py-2.5 text-[13px] leading-[1.6] text-[#3B2F2F] outline-none placeholder:text-[#5C4033]/28" />
                {rMention && <MentionDropdown names={rFiltered} anchorRef={replyTaRef} onPick={rPickMention} />}
                <div className="mt-2.5 flex items-center justify-end gap-2.5">
                  <button onClick={onToggleReply} className="text-[11.5px] text-[#5C4033]/35 hover:text-[#5C4033] transition-colors">Cancel</button>
                  <button onClick={onPostReply} disabled={postingReply || !replyDraft.trim()}
                    className="rounded-full bg-[#3D5A35] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#fff8f0] hover:bg-[#31492c] disabled:opacity-40 transition">
                    {postingReply ? 'Posting…' : 'Reply'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Replies */}
          {replyCount > 0 && !isEditingThread && (
            <div className="mt-3 flex gap-3">
              <div className="f-reply-line ml-[2px] w-px shrink-0 self-stretch rounded-full bg-gradient-to-b from-[#3D5A35]/20 to-transparent" style={{ opacity: 0.2 }} />
              <div className="flex flex-col gap-3 flex-1">
                {threadReplies.map((r, ri) => {
                  const replyKey = `${thread.id}:${r.id}`
                  const isEditingThis = editingReplyKey === replyKey
                  const isReplyOwner = !!(currentUid && r.authorId === currentUid)
                  const rMyVote = replyVotes[replyKey] ?? 0
                  const rScore = replyScores[replyKey] ?? 0
                  return (
                    <div key={r.id} className="f-rise f-reply-row group/reply" style={{ animationDelay: `${ri * 50}ms` }}>
                      <div className="flex items-start gap-2">
                        <Avatar name={r.authorName} px={18} />
                        <div className="min-w-0 flex-1">
                          {/* Meta row */}
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10.5px] font-semibold text-[#3B2F2F]/62">{r.authorName}</span>
                            <span className="text-[9px] text-[#5C4033]/22 select-none">·</span>
                            <span className="text-[10px] text-[#5C4033]/32">{ago(r.updatedAt ?? r.createdAt)}</span>
                            {isReplyOwner && !isEditingThis && (
                              <span className="f-reply-ghost ml-1 flex items-center gap-0.5">
                                <button onClick={() => onStartReplyEdit(r.id, r.body)} aria-label="Edit reply"
                                  className="f-btn flex h-5 w-5 items-center justify-center rounded text-[#5C4033]/25 hover:bg-[#3D5A35]/8 hover:text-[#3D5A35]/60">
                                  <svg viewBox="0 0 12 12" className="h-[9px] w-[9px]" fill="none">
                                    <path d="M1.5 10.5l1-3.5 6-6 2.5 2.5-6 6-3.5 1z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                                <button onClick={() => onDeleteReply(r.id)} aria-label="Delete reply"
                                  className="f-btn flex h-5 w-5 items-center justify-center rounded text-[#5C4033]/25 hover:bg-[#b4543e]/8 hover:text-[#b4543e]/60">
                                  <svg viewBox="0 0 12 12" className="h-[9px] w-[9px]" fill="none">
                                    <path d="M2 3.5h8M4.5 3.5V2.5h3V3.5M3 3.5l.5 7h5l.5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                              </span>
                            )}
                          </div>
                          {/* Body */}
                          {isEditingThis ? (
                            <div>
                              <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={2} autoFocus
                                className="f-input w-full resize-none rounded-lg border border-[#3D5A35]/12 bg-[rgba(255,248,240,0.6)] px-3 py-2 text-[12.5px] leading-[1.6] text-[#3B2F2F] outline-none" />
                              <div className="mt-2 flex items-center gap-2">
                                <button onClick={() => onSaveReplyEdit(r.id)} disabled={savingEdit === replyKey || !editDraft.trim()}
                                  className="rounded-full bg-[#3D5A35] px-3.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#fff8f0] hover:bg-[#31492c] disabled:opacity-40 transition">
                                  {savingEdit === replyKey ? 'Saving…' : 'Save'}
                                </button>
                                <button onClick={onCancelReplyEdit} className="text-[11px] text-[#5C4033]/40 hover:text-[#5C4033] transition-colors">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <BodyText text={r.body} className="text-[12.5px] leading-[1.62] text-[#3B2F2F]/68 whitespace-pre-wrap" />
                          )}
                          {/* Inline reply votes — subtle, appears on hover */}
                          {!isEditingThis && (
                            <div className="f-reply-ghost mt-1 flex items-center gap-1">
                              <button onClick={() => onReplyVote(r.id, 1)} aria-label="Upvote reply"
                                className={`f-btn flex items-center justify-center rounded px-1 py-0.5 text-[9px] transition ${rMyVote === 1 ? 'text-[#3D5A35]' : 'text-[#5C4033]/28 hover:text-[#3D5A35]'}`}>
                                <svg viewBox="0 0 8 8" className="h-[7px] w-[7px]" fill="currentColor"><path d="M4 1 1 5h6z"/></svg>
                              </button>
                              {rScore !== 0 && (
                                <span className={`text-[9px] font-semibold tabular-nums ${rMyVote === 1 ? 'text-[#3D5A35]' : rMyVote === -1 ? 'text-[#b4543e]' : 'text-[#5C4033]/35'}`}>
                                  {rScore}
                                </span>
                              )}
                              <button onClick={() => onReplyVote(r.id, -1)} aria-label="Downvote reply"
                                className={`f-btn flex items-center justify-center rounded px-1 py-0.5 text-[9px] transition ${rMyVote === -1 ? 'text-[#b4543e]' : 'text-[#5C4033]/28 hover:text-[#b4543e]'}`}>
                                <svg viewBox="0 0 8 8" className="h-[7px] w-[7px]" fill="currentColor"><path d="M4 7 1 3h6z"/></svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
