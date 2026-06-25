import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Get Started',
  robots: { index: false, follow: false },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
