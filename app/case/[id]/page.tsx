'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDocs, limit, query, where } from 'firebase/firestore'
import { casesCol } from '@/lib/firebase/collections'
import PlatformLoader from '@/components/PlatformLoader'
import { InterviewerPageInner } from './interviewer/InterviewerExperience'
import { SLUG_TO_DOC_ID } from '@/lib/slugMap'

function CaseBySlug({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [docId, setDocId] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let cancelled = false
    const resolve = async () => {
      const { id: slug } = await params

      // Fast path: resolve slug → docId from the static map (no network round-trip).
      // Falls back to a Firestore query only for slugs not in the map (new cases not
      // yet deployed, legacy direct-docId links like /case/case-1).
      const mapped = SLUG_TO_DOC_ID[slug]
      if (mapped) {
        if (!cancelled) setDocId(mapped)
        return
      }

      // Slow path: slug not in static map — try Firestore lookup.
      try {
        const snap = await getDocs(query(casesCol, where('slug', '==', slug), limit(1)))
        if (cancelled) return
        if (!snap.empty) {
          setDocId(snap.docs[0].id)
        } else {
          // Final fallback: treat the param as a raw doc id (e.g. /case/case-42)
          setDocId(slug)
        }
      } catch {
        if (!cancelled) setNotFound(true)
      }
    }
    resolve()
    return () => {
      cancelled = true
    }
  }, [params])

  useEffect(() => {
    if (notFound) router.replace('/repository')
  }, [notFound, router])

  // Stable promise identity so InterviewerPageInner's fetch effect doesn't re-run.
  const innerParams = useMemo(
    () => (docId ? Promise.resolve({ id: docId }) : null),
    [docId],
  )

  if (notFound || !innerParams) return <PlatformLoader />

  return <InterviewerPageInner params={innerParams} forcePreview />
}

export default function CaseSlugPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PlatformLoader />}>
      <CaseBySlug params={params} />
    </Suspense>
  )
}
