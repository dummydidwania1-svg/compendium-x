import type { Metadata } from 'next'

const DESCRIPTION =
  'Sign in to practice recorded, scored case interviews and track your progress to the offer, or create a free account and run your first case today.'

export const metadata: Metadata = {
  title: 'Sign In or Start Free',
  description: DESCRIPTION,
  alternates: { canonical: '/login' },
  openGraph: {
    title: 'Case CompendiumX: Sign In or Start Free',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/login',
  },
  twitter: {
    title: 'Case CompendiumX: Sign In or Start Free',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
