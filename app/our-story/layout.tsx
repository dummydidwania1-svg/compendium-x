import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Our Story: Three Editions, a Million Readers',
  description: 'It began as Delhi University first consulting case book, written by students and given away free. Two print editions and a million readers later, the third edition is AI first, with agents that record, transcribe and analyse your practice.',
  alternates: { canonical: '/our-story' },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
