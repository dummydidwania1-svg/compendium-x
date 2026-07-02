import type { Metadata } from 'next'

const DESCRIPTION =
  'The market entry framework for case interviews, broken down step by step. Size the market, test attractiveness, weigh entry modes from build to buy to partner, and decide go or no go the way a partner round expects.'

export const metadata: Metadata = {
  title: 'Market Entry Framework for Case Interviews',
  description: DESCRIPTION,
  keywords: ['market entry framework', 'market entry case', 'go to market case interview', 'market attractiveness framework'],
  alternates: { canonical: '/repository/frameworks/market-entry' },
  openGraph: {
    title: 'Case CompendiumX: Market Entry Framework for Case Interviews',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/repository/frameworks/market-entry',
  },
  twitter: {
    title: 'Case CompendiumX: Market Entry Framework for Case Interviews',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
