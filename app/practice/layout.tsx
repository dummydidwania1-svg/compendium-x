import type { Metadata } from 'next'

const DESCRIPTION =
  'Sit a real case the way a partner round feels, solo against the interviewer or split screen with a peer. Agents record and transcribe it live, then score you on structure, reasoning and communication the moment you finish.'

export const metadata: Metadata = {
  title: 'Practice a Live Case, Solo or With a Peer',
  description: DESCRIPTION,
  alternates: { canonical: '/practice' },
  openGraph: {
    title: 'Case CompendiumX: Practice a Live Case, Solo or With a Peer',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/practice',
  },
  twitter: {
    title: 'Case CompendiumX: Practice a Live Case, Solo or With a Peer',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
