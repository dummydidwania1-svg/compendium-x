import type { Metadata } from 'next'

const DESCRIPTION =
  'The case book a million readers grew up on, now AI first. Agents record, transcribe and analyse your case interview practice against real cases from the top consulting firms, then track your goals to the offer.'

export const metadata: Metadata = {
  title: 'About Case CompendiumX',
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Case CompendiumX: About Case CompendiumX',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/',
  },
  twitter: {
    title: 'Case CompendiumX: About Case CompendiumX',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
