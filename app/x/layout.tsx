import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Case CompendiumX',
  description:
    'The case book a million readers grew up on, now AI first for consulting case interview practice.',
  alternates: { canonical: '/' },
  robots: { index: false, follow: true },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
