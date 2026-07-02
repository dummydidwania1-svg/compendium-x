import type { Metadata } from 'next'

const DESCRIPTION =
  'The profitability framework for case interviews, broken down step by step. See how revenue splits into units and price, how costs split into fixed and variable, and how to isolate the driver of a profit decline. Worked from real firm cases.'

export const metadata: Metadata = {
  title: 'Profitability Framework for Case Interviews',
  description: DESCRIPTION,
  keywords: ['profitability framework', 'profit case interview', 'revenue cost breakdown', 'profitability case framework'],
  alternates: { canonical: '/repository/frameworks/profitability' },
  openGraph: {
    title: 'Case CompendiumX: Profitability Framework for Case Interviews',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/repository/frameworks/profitability',
  },
  twitter: {
    title: 'Case CompendiumX: Profitability Framework for Case Interviews',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
