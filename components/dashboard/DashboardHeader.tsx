type DashboardHeaderProps = {
  userEmail: string | null
  onSignOut: () => void
}

export function DashboardHeader({ userEmail, onSignOut }: DashboardHeaderProps) {
  return (
    <header className="border-b border-stone-300 bg-stone-50/80 backdrop-blur sticky top-0 z-10">
      <div className="px-5 py-4 lg:px-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Candidate Dashboard</p>
          <h1 className="text-2xl font-serif text-stone-900">Performance Compendium</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onSignOut}
            className="lg:hidden rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 transition"
          >
            Sign Out
          </button>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Signed In As</p>
            <p className="text-sm font-medium text-stone-700">{userEmail ?? 'Unknown User'}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
