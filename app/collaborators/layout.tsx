import type { Metadata } from 'next'

const DESCRIPTION =
  'Writers and reviewers from SRCC, Ashoka, St. Stephens, LSR, IIT Delhi and IIT Bombay who turned a student case book into the resource a million readers trusted across three editions.'

export const metadata: Metadata = {
  title: 'Contributors Across Every Top Campus',
  description: DESCRIPTION,
  alternates: { canonical: '/collaborators' },
  openGraph: {
    title: 'Case CompendiumX: Contributors Across Every Top Campus',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/collaborators',
  },
  twitter: {
    title: 'Case CompendiumX: Contributors Across Every Top Campus',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
