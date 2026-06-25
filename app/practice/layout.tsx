import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Practice a Live Case, Solo or With a Peer',
  description: 'Sit a real case the way a partner round feels, solo against the interviewer or split screen with a peer. Agents record and transcribe it live, then score you on structure, reasoning and communication the moment you finish.',
  alternates: { canonical: '/practice' },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
