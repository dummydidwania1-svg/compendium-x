'use client'

import type { ReactNode } from 'react'
import { DashboardHeader } from './DashboardHeader'
import { DashboardSidebar } from './DashboardSidebar'

type DashboardShellProps = {
  userEmail: string | null
  onSignOut: () => void
  children: ReactNode
}

export function DashboardShell({ userEmail, onSignOut, children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,#d1fae5_0%,transparent_35%),radial-gradient(circle_at_bottom_left,#fde68a_0%,transparent_30%),linear-gradient(180deg,#ece8de_0%,#f7f4ec_100%)] text-stone-900">
      <div className="flex min-h-screen">
        <DashboardSidebar onSignOut={onSignOut} />
        <div className="flex-1 min-w-0">
          <DashboardHeader userEmail={userEmail} onSignOut={onSignOut} />
          <main className="p-5 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  )
}
