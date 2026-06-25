import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In or Start Free',
  description: 'Sign in to practice recorded, scored case interviews and track your progress to the offer, or create a free account and run your first case today.',
  alternates: { canonical: '/login' },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
