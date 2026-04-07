'use client'

import Link from 'next/link'

type DashboardSidebarProps = {
  onSignOut: () => void
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', active: true },
  { label: 'Case Library', href: '/repository', active: false },
  { label: 'Practice', href: '/practice', active: false },
]

export function DashboardSidebar({ onSignOut }: DashboardSidebarProps) {
  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-stone-300 lg:bg-stone-100">
      <div className="h-20 border-b border-stone-300 px-6 flex items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Compendium</p>
          <p className="text-2xl font-serif font-semibold text-stone-900">X</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`block rounded-lg px-4 py-3 text-sm font-medium transition ${
              item.active
                ? 'bg-stone-900 text-stone-100'
                : 'text-stone-700 hover:bg-stone-200 hover:text-stone-900'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-stone-300 p-4">
        <button
          onClick={onSignOut}
          className="w-full rounded-lg border border-stone-400 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200 transition"
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
