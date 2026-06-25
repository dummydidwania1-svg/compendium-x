import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About Case CompendiumX',
  description: 'The case book a million readers grew up on, now AI first. Agents record, transcribe and analyse your case interview practice against real cases from the top consulting firms, then track your goals to the offer.',
  alternates: { canonical: '/' },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
