import type { Metadata } from 'next'

const DESCRIPTION =
  '70+ real interview cases across 25 industries, from FMCG and airlines to steel, pharma, renewable energy and BFSI. Each one names the firm it came from and opens into a full solution tree. Filter by industry, round and difficulty.'

export const metadata: Metadata = {
  title: 'Case Repository, 70+ Real Firm Cases',
  description: DESCRIPTION,
  alternates: { canonical: '/repository' },
  openGraph: {
    title: 'Case CompendiumX: Case Repository, 70+ Real Firm Cases',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/repository',
  },
  twitter: {
    title: 'Case CompendiumX: Case Repository, 70+ Real Firm Cases',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
