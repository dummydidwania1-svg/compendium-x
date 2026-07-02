import type { Metadata } from 'next'

const DESCRIPTION =
  'The unconventional case framework for interviews that do not fit a standard template. Build a structure from first principles, adapt to non standard prompts, and stay MECE when there is no ready made framework.'

export const metadata: Metadata = {
  title: 'Unconventional Case Framework',
  description: DESCRIPTION,
  keywords: ['unconventional case framework', 'non standard case interview', 'first principles case', 'custom case framework'],
  alternates: { canonical: '/repository/frameworks/unconventional' },
  openGraph: {
    title: 'Case CompendiumX: Unconventional Case Framework',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/repository/frameworks/unconventional',
  },
  twitter: {
    title: 'Case CompendiumX: Unconventional Case Framework',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
