'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db, waitForAuthUser } from '@/lib/firebase/config'

type CommentDocument = {
  body?: string
  title?: string
  authorId?: string
  authorName?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

type ReplyDocument = {
  body?: string
  authorId?: string
  authorName?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

type CommentItem = {
  id: string
  body: string
  authorId: string | null
  authorName: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

type ReplyItem = {
  id: string
  body: string
  authorId: string | null
  authorName: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

type CaseForumSectionProps = {
  caseId: string
  caseTitle?: string
}

function formatDate(value?: Timestamp): string {
  if (!value) return 'Unknown date'
  return value.toDate().toLocaleString()
}

function toMillis(value?: Timestamp): number {
  return value?.toMillis?.() ?? 0
}

function mapComment(id: string, value: CommentDocument): CommentItem {
  const body =
    typeof value.body === 'string' && value.body.trim().length > 0
      ? value.body.trim()
      : typeof value.title === 'string'
        ? value.title.trim()
        : ''

  return {
    id,
    body: body || 'No content',
    authorId: typeof value.authorId === 'string' ? value.authorId : null,
    authorName: typeof value.authorName === 'string' && value.authorName.trim() ? value.authorName : 'Unknown',
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function mapReply(id: string, value: ReplyDocument): ReplyItem {
  return {
    id,
    body: typeof value.body === 'string' ? value.body : '',
    authorId: typeof value.authorId === 'string' ? value.authorId : null,
    authorName: typeof value.authorName === 'string' && value.authorName.trim() ? value.authorName : 'Unknown',
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function toFriendlyError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback
  if (message.includes('Missing or insufficient permissions')) {
    return 'This action is blocked by current Firebase rules. Please update rules and try again.'
  }
  return message
}

export function CaseForumSection({ caseId, caseTitle }: CaseForumSectionProps) {
  const router = useRouter()

  const [user, setUser] = useState<User | null>(null)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [repliesByComment, setRepliesByComment] = useState<Record<string, ReplyItem[]>>({})
  const [userVotes, setUserVotes] = useState<Record<string, number>>({})
  const [loadingComments, setLoadingComments] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [postingReplyFor, setPostingReplyFor] = useState<string | null>(null)

  const requireLogin = () => {
    router.push(`/login?redirect=${encodeURIComponent(`/case/${caseId}/interviewer?preview=1&tab=forum`)}`)
  }

  const resolveAuthorName = async (currentUser: User) => {
    const profileSnapshot = await getDoc(doc(db, 'profiles', currentUser.uid))
    const profileData = profileSnapshot.exists() ? profileSnapshot.data() : null
    if (typeof profileData?.fullName === 'string' && profileData.fullName.trim()) {
      return profileData.fullName.trim()
    }
    return currentUser.email ?? 'Community Member'
  }

  const loadUserVotes = useCallback(
    async (rows: CommentItem[], uid: string) => {
      try {
        const entries = await Promise.all(
          rows.map(async (row) => {
            const voteSnapshot = await getDoc(doc(db, 'case_forums', caseId, 'threads', row.id, 'votes', uid))
            if (!voteSnapshot.exists()) return [row.id, 0] as const
            const value = voteSnapshot.data()?.value
            return [row.id, value === 1 || value === -1 ? value : 0] as const
          })
        )
        setUserVotes(Object.fromEntries(entries))
      } catch {
        // Don't block forum rendering if vote lookups fail.
        setUserVotes({})
      }
    },
    [caseId]
  )

  const loadRepliesForComments = useCallback(
    async (rows: CommentItem[]) => {
      const entries = await Promise.all(
        rows.map(async (comment) => {
          try {
            const snapshot = await getDocs(collection(db, 'case_forums', caseId, 'threads', comment.id, 'replies'))
            const mapped = snapshot.docs.map((item) => mapReply(item.id, item.data() as ReplyDocument))
            mapped.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
            return [comment.id, mapped] as const
          } catch {
            return [comment.id, []] as const
          }
        })
      )

      setRepliesByComment(Object.fromEntries(entries))
    },
    [caseId]
  )

  const loadComments = useCallback(
    async (currentUser: User | null) => {
      setLoadingComments(true)
      setLoadError('')
      try {
        const snapshot = await getDocs(collection(db, 'case_forums', caseId, 'threads'))
        const mapped = snapshot.docs.map((item) => mapComment(item.id, item.data() as CommentDocument))
        mapped.sort((a, b) => {
          const aRank = Math.max(toMillis(a.updatedAt), toMillis(a.createdAt))
          const bRank = Math.max(toMillis(b.updatedAt), toMillis(b.createdAt))
          return bRank - aRank
        })

        setComments(mapped)
        await loadRepliesForComments(mapped)
        if (currentUser) {
          await loadUserVotes(mapped, currentUser.uid)
        } else {
          setUserVotes({})
        }
      } catch (error) {
        setLoadError(toFriendlyError(error, 'Unable to load forum comments.'))
      } finally {
        setLoadingComments(false)
      }
    },
    [caseId, loadRepliesForComments, loadUserVotes]
  )

  useEffect(() => {
    const init = async () => {
      const currentUser = await waitForAuthUser()
      setUser(currentUser)
      await loadComments(currentUser)
    }
    init()
  }, [loadComments])

  const handlePostComment = async () => {
    if (!user) {
      requireLogin()
      return
    }

    const body = commentDraft.trim()
    if (!body) {
      setActionError('Comment cannot be empty.')
      return
    }

    setSubmittingComment(true)
    setActionError('')

    try {
      const authorName = await resolveAuthorName(user)
      await addDoc(collection(db, 'case_forums', caseId, 'threads'), {
        caseId,
        caseTitle: caseTitle ?? null,
        body,
        authorId: user.uid,
        authorName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      await setDoc(
        doc(db, 'case_forums', caseId),
        {
          caseId,
          caseTitle: caseTitle ?? null,
          updatedAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          threadCount: increment(1),
        },
        { merge: true }
      )

      setCommentDraft('')
      await loadComments(user)
    } catch (error) {
      setActionError(toFriendlyError(error, 'Unable to post comment.'))
    } finally {
      setSubmittingComment(false)
    }
  }

  const handlePostReply = async (commentId: string) => {
    if (!user) {
      requireLogin()
      return
    }

    const body = replyDraft.trim()
    if (!body) {
      setActionError('Reply cannot be empty.')
      return
    }

    setPostingReplyFor(commentId)
    setActionError('')

    try {
      const authorName = await resolveAuthorName(user)
      await addDoc(collection(db, 'case_forums', caseId, 'threads', commentId, 'replies'), {
        body,
        authorId: user.uid,
        authorName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      await updateDoc(doc(db, 'case_forums', caseId, 'threads', commentId), {
        updatedAt: serverTimestamp(),
      })

      setReplyDraft('')
      setOpenReplyFor(null)
      await loadComments(user)
    } catch (error) {
      setActionError(toFriendlyError(error, 'Unable to post reply.'))
    } finally {
      setPostingReplyFor(null)
    }
  }

  const handleVote = async (commentId: string, nextVote: 1 | -1) => {
    if (!user) {
      requireLogin()
      return
    }

    const voteRef = doc(db, 'case_forums', caseId, 'threads', commentId, 'votes', user.uid)

    try {
      const voteSnapshot = await getDoc(voteRef)
      const currentVote = voteSnapshot.exists() ? voteSnapshot.data()?.value : 0

      if (currentVote === nextVote) {
        await deleteDoc(voteRef)
        setUserVotes((current) => ({ ...current, [commentId]: 0 }))
        return
      }

      await setDoc(voteRef, { value: nextVote, updatedAt: serverTimestamp() }, { merge: true })
      setUserVotes((current) => ({ ...current, [commentId]: nextVote }))
    } catch (error) {
      setActionError(toFriendlyError(error, 'Unable to apply vote.'))
    }
  }

  const orderedComments = useMemo(() => comments, [comments])
  const totalReplies = useMemo(
    () => Object.values(repliesByComment).reduce((sum, rows) => sum + rows.length, 0),
    [repliesByComment]
  )

  return (
    <section className="mt-16 rounded-[28px] border border-[#5C4033]/10 bg-[rgba(255,248,240,0.82)] p-8 shadow-[0_20px_80px_rgba(92,64,51,0.08)] backdrop-blur-sm">
      <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow !mb-2">Case Discussion</p>
          <h2
            style={{ fontFamily: "'Newsreader', serif" }}
            className="text-4xl font-light tracking-tight text-[#453a2a]"
          >
            Forum
          </h2>
          <p className="mt-3 text-[14px] leading-7 text-[#5C4033]/68">
            Discuss structure, strategy, and interviewer-led approaches for this case in a format that stays useful for future practice rounds.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em]">
          <span className="rounded-full border border-[#3D5A35]/14 bg-[#3D5A35]/6 px-3 py-1.5 font-semibold text-[#3D5A35]">
            {orderedComments.length} {orderedComments.length === 1 ? 'Thread' : 'Threads'}
          </span>
          <span className="rounded-full border border-[#5C4033]/10 bg-[#f2e9dd] px-3 py-1.5 font-semibold text-[#5C4033]/62">
            {totalReplies} {totalReplies === 1 ? 'Reply' : 'Replies'}
          </span>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-2xl border border-[#b4543e]/18 bg-[rgba(255,244,239,0.92)] px-4 py-3 text-sm leading-6 text-[#92400e]">
          {loadError}
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-2xl border border-[#b4543e]/18 bg-[rgba(255,244,239,0.92)] px-4 py-3 text-sm leading-6 text-[#92400e]">
          {actionError}
        </div>
      )}

      <div className="glass-card mb-8 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow !mb-1">Add Comment</p>
            <p className="text-sm text-[#5C4033]/62">
              Share the structure you would run, a framework angle, or what a candidate should watch out for.
            </p>
          </div>
          <span className="hidden rounded-full border border-[#5C4033]/10 bg-[#f3ebdf] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5C4033]/45 md:inline-flex">
            Thread Starter
          </span>
        </div>

        <textarea
          rows={4}
          value={commentDraft}
          onChange={(event) => setCommentDraft(event.target.value)}
          placeholder="Share your approach, structure, or framework idea..."
          className="mt-4 w-full rounded-[20px] border border-[#5C4033]/12 bg-[#f7efe5] px-4 py-3 text-sm leading-7 text-[#3B2F2F] outline-none transition focus:border-[#3D5A35]/35 focus:bg-[#fbf5ed]"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handlePostComment}
            disabled={submittingComment}
            className="rounded-full bg-[#3D5A35] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#fff8f0] transition hover:bg-[#31492c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submittingComment ? 'Posting...' : user ? 'Post Comment' : 'Sign In To Comment'}
          </button>
          <p className="text-xs leading-6 text-[#5C4033]/48">
            Keep it specific and reusable so later users can learn from the thread.
          </p>
        </div>
      </div>

      <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-1 custom-scrollbar">
        {loadingComments ? (
          <div className="glass-card p-6 text-sm text-[#5C4033]/55">Loading comments...</div>
        ) : orderedComments.length === 0 ? (
          <div className="glass-card p-6 text-sm text-[#5C4033]/55">
            No comments yet. Be the first to discuss this case.
          </div>
        ) : (
          orderedComments.map((comment) => {
            const currentVote = userVotes[comment.id] ?? 0
            const replies = repliesByComment[comment.id] ?? []
            const replyOpen = openReplyFor === comment.id

            return (
              <article
                key={comment.id}
                className="glass-card rounded-[24px] border-[#5C4033]/8 bg-[#f7efe4] p-5 transition hover:bg-[#fbf4ea]"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#3D5A35]/12 bg-[#3D5A35]/8 text-sm font-semibold uppercase tracking-[0.08em] text-[#3D5A35]">
                      {comment.authorName.trim().charAt(0) || 'C'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#3B2F2F]">{comment.authorName}</p>
                        <span className="rounded-full border border-[#5C4033]/10 bg-[#f2e9dd] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#5C4033]/45">
                          {replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#5C4033]/42">
                        {formatDate(comment.updatedAt ?? comment.createdAt)}
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-[14px] leading-7 text-[#5C4033]/78">
                        {comment.body}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 md:pl-4">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[#5C4033]/38">Vote</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleVote(comment.id, 1)}
                        aria-label="Upvote comment"
                        title="Upvote"
                        className={`h-9 w-9 rounded-full border text-sm transition ${
                          currentVote === 1
                            ? 'border-[#3D5A35]/28 bg-[#3D5A35]/10 text-[#3D5A35]'
                            : 'border-[#5C4033]/12 bg-[#f3ebdf] text-[#5C4033]/55 hover:border-[#3D5A35]/22 hover:bg-[#e8ecdf] hover:text-[#3D5A35]'
                        }`}
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleVote(comment.id, -1)}
                        aria-label="Downvote comment"
                        title="Downvote"
                        className={`h-9 w-9 rounded-full border text-sm transition ${
                          currentVote === -1
                            ? 'border-[#b4543e]/25 bg-[#b4543e]/10 text-[#92400e]'
                            : 'border-[#5C4033]/12 bg-[#f3ebdf] text-[#5C4033]/55 hover:border-[#b4543e]/22 hover:bg-[#f3e6dd] hover:text-[#92400e]'
                        }`}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (replyOpen) {
                        setOpenReplyFor(null)
                        setReplyDraft('')
                      } else {
                        setOpenReplyFor(comment.id)
                        setReplyDraft('')
                      }
                    }}
                    className="rounded-full border border-[#5C4033]/12 bg-[#f3ebdf] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5C4033]/68 transition hover:border-[#3D5A35]/22 hover:bg-[#e8ecdf] hover:text-[#3D5A35]"
                  >
                    {replyOpen ? 'Close Reply' : 'Reply'}
                  </button>
                </div>

                {replies.length > 0 && (
                  <div className="mt-5 space-y-3 border-l border-[#3D5A35]/14 pl-4">
                    {replies.map((reply) => (
                      <div key={reply.id} className="rounded-2xl border border-[#5C4033]/8 bg-[#f4ece1] p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#5C4033]/10 bg-[#D9D0C4]/28 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5C4033]">
                            {reply.authorName.trim().charAt(0) || 'R'}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#3B2F2F]">{reply.authorName}</p>
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[#5C4033]/40">
                              {formatDate(reply.updatedAt ?? reply.createdAt)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-[14px] leading-7 text-[#5C4033]/76">
                          {reply.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {replyOpen && (
                  <div className="mt-3">
                    <textarea
                      rows={3}
                      value={replyDraft}
                      onChange={(event) => setReplyDraft(event.target.value)}
                      placeholder="Write a reply..."
                      className="w-full rounded-[18px] border border-[#5C4033]/12 bg-[#f7efe5] px-4 py-3 text-sm leading-7 text-[#3B2F2F] outline-none transition focus:border-[#3D5A35]/35 focus:bg-[#fbf5ed]"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => handlePostReply(comment.id)}
                        disabled={postingReplyFor === comment.id}
                        className="rounded-full bg-[#3D5A35] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#fff8f0] transition hover:bg-[#31492c] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {postingReplyFor === comment.id ? 'Posting...' : 'Post Reply'}
                      </button>
                      <button
                        onClick={() => {
                          setOpenReplyFor(null)
                          setReplyDraft('')
                        }}
                        className="rounded-full border border-[#5C4033]/12 bg-[#f3ebdf] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5C4033]/68 transition hover:border-[#5C4033]/22 hover:bg-[#ebe1d3]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}
