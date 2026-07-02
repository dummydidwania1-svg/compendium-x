import type { Metadata } from 'next'

const DESCRIPTION =
  'The growth strategy framework for case interviews, broken down step by step. Split growth into organic and inorganic, grow the customer base or revenue per customer, and pressure test each lever against a real firm case.'

export const metadata: Metadata = {
  title: 'Growth Strategy Framework for Case Interviews',
  description: DESCRIPTION,
  keywords: ['growth framework', 'growth strategy case', 'revenue growth case interview', 'organic inorganic growth'],
  alternates: { canonical: '/repository/frameworks/growth' },
  openGraph: {
    title: 'Case CompendiumX: Growth Strategy Framework for Case Interviews',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/repository/frameworks/growth',
  },
  twitter: {
    title: 'Case CompendiumX: Growth Strategy Framework for Case Interviews',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
