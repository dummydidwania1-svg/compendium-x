import type { Metadata } from 'next'

const DESCRIPTION =
  'The people behind Case CompendiumX went on to Kearney, McKinsey, L.E.K., Harvard Business School, Warburg Pincus, Eight Roads and Fidelity. They built the case prep resource they wished they had.'

export const metadata: Metadata = {
  title: 'The Team Who Cracked It, Then Built It',
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'Case CompendiumX: The Team Who Cracked It, Then Built It',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/about',
  },
  twitter: {
    title: 'Case CompendiumX: The Team Who Cracked It, Then Built It',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
