import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'The Team Who Cracked It, Then Built It',
  description: 'The people behind Case CompendiumX went on to Kearney, McKinsey, L.E.K., Harvard Business School, Warburg Pincus, Eight Roads and Fidelity. They built the case prep resource they wished they had.',
  alternates: { canonical: '/about' },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
