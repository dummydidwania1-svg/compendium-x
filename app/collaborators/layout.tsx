import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contributors Across Every Top Campus',
  description: 'Writers and reviewers from SRCC, Ashoka, St. Stephens, LSR, IIT Delhi and IIT Bombay who turned a student case book into the resource a million readers trusted across three editions.',
  alternates: { canonical: '/collaborators' },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
