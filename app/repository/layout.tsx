import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Case Library: 70+ Real Firm Cases',
  description: '70+ real interview cases across 25 industries, from FMCG and airlines to steel, pharma, renewable energy and BFSI. Each one names the firm it came from and opens into a full solution tree. Filter by industry, round and difficulty.',
  alternates: { canonical: '/repository' },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
