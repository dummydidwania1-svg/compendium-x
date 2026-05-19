'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MarketingAuthPanel from '@/components/auth/MarketingAuthPanel'
import { waitForAuthUser } from '@/lib/firebase/config'
import { getPostAuthRoute } from '@/lib/auth/postAuth'

function LoginScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedRedirect = searchParams.get('redirect')
  const redirectTarget = requestedRedirect && requestedRedirect.startsWith('/') ? requestedRedirect : '/dashboard'
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let isMounted = true

    const checkExistingSession = async () => {
      const existingUser = await waitForAuthUser()
      if (!isMounted) return
      if (existingUser) {
        const nextRoute = await getPostAuthRoute(existingUser.uid, redirectTarget)
        router.replace(nextRoute)
        router.refresh()
        return
      }
      setCheckingSession(false)
    }

    checkExistingSession()
    return () => {
      isMounted = false
    }
  }, [redirectTarget, router])

  if (checkingSession) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#fff8f0] p-4"
        style={{ fontFamily: "'Work Sans', sans-serif", color: '#5C4033' }}
      >
        Checking your session...
      </div>
    )
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[#fff8f0]"
      style={{ fontFamily: "'Work Sans', sans-serif", color: '#1e1b15' }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(61,90,53,0.08),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(92,64,51,0.08),transparent_32%),linear-gradient(180deg,#fff8f0_0%,#fbf4ea_100%)]" />
        <div className="absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40 blur-[120px]" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center p-6">
        <MarketingAuthPanel redirectTarget={redirectTarget} onClose={() => router.push('/')} />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center bg-[#fff8f0] p-6"
          style={{ fontFamily: "'Work Sans', sans-serif", color: '#5C4033' }}
        >
          Loading...
        </div>
      }
    >
      <LoginScreen />
    </Suspense>
  )
}
