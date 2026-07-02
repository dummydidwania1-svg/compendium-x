import type { Metadata } from 'next'

const DESCRIPTION =
  'The guesstimate and market sizing framework for case interviews, broken down step by step. Pick a top down or bottom up approach, state clean assumptions, and reach a defensible number with worked examples.'

export const metadata: Metadata = {
  title: 'Guesstimate and Market Sizing Framework',
  description: DESCRIPTION,
  keywords: ['guesstimate', 'market sizing', 'guesstimate examples', 'market sizing questions', 'guesstimate framework'],
  alternates: { canonical: '/repository/frameworks/guesstimate' },
  openGraph: {
    title: 'Case CompendiumX: Guesstimate and Market Sizing Framework',
    description: DESCRIPTION,
    url: 'https://www.casecompendiumx.in/repository/frameworks/guesstimate',
  },
  twitter: {
    title: 'Case CompendiumX: Guesstimate and Market Sizing Framework',
    description: DESCRIPTION,
  },
}

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
