import type { Metadata } from 'next'

const DESCRIPTION =
  'It began as Delhi University first consulting case book, written by students and given away free. Two print editions and a million readers later, the third edition is AI first, with agents that record, transcribe and analyse your practice.'

export const metadata: Metadata = {
  title: 'Our Story, Three Editions and a Million Readers',
  description: DESCRIPTION,
  alternates: { canonical: '/our-story' },
  openGraph: {
    title: 'Case CompendiumX: Our Story, Three Editions and a Million Readers',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/our-story',
  },
  twitter: {
    title: 'Case CompendiumX: Our Story, Three Editions and a Million Readers',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
