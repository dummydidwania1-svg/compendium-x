import type { Metadata } from 'next'

const DESCRIPTION =
  'The pricing framework for case interviews, broken down step by step. Compare cost based, competitor based and value based pricing, read willingness to pay, and recommend a price the way a partner round expects.'

export const metadata: Metadata = {
  title: 'Pricing Framework for Case Interviews',
  description: DESCRIPTION,
  keywords: ['pricing framework', 'pricing case interview', 'value based pricing case', 'pricing strategy framework'],
  alternates: { canonical: '/repository/frameworks/pricing' },
  openGraph: {
    title: 'Case CompendiumX: Pricing Framework for Case Interviews',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/repository/frameworks/pricing',
  },
  twitter: {
    title: 'Case CompendiumX: Pricing Framework for Case Interviews',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
