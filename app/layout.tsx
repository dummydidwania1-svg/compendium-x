import type { Metadata } from 'next'
import { Newsreader, Work_Sans } from 'next/font/google'
import GlobalStyles from '@/components/GlobalStyles'
import Analytics from '@/components/Analytics';
import OfflineSetup from '@/components/OfflineSetup'
import OfflineBanner from '@/components/OfflineBanner'
// @ts-ignore - CSS side-effect import is supported by Next.js
import './globals.css'

// Self-hosted via next/font — zero extra DNS/TCP/TLS round-trip, no render blocking,
// automatic font-display:swap, and only the weights we actually use.
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
  preload: true,
})

const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-work-sans',
  display: 'swap',
  preload: true,
})

const CCX_KEYWORDS = [
  // Primary intent: case prep, front-loaded
  'case prep', 'case interview prep', 'case interview preparation', 'case practice',
  'case interview practice', 'case study interview', 'consulting case prep',
  'case book', 'case compendium', 'case casebook', 'consulting casebook',
  'case interview examples', 'case interview frameworks', 'case frameworks',
  'guesstimate practice', 'market sizing practice', 'structured problem solving',
  // Brand and variants (fights the autocorrect)
  'Case CompendiumX', 'Case Compendium X', 'casecompendiumx', 'case compendium x',
  'CompendiumX', 'Compendium X', 'CCX', 'case compendium 3rd edition',
  // Consulting firms and roles (full roster, not just MBB)
  'consulting interview', 'management consulting', 'MBB', 'consulting jobs',
  'consulting placements', 'strategy consulting', 'consultant interview questions',
  'McKinsey case interview', 'BCG case interview', 'Bain case interview',
  'Kearney case interview', 'AT Kearney case interview', 'L.E.K. case interview',
  'LEK Consulting case interview', 'Strategy& case interview', 'Parthenon case interview',
  'EY Parthenon case interview', 'Accenture Strategy case interview',
  'Accenture Capability Network', 'Bain Capability Network', 'Dalberg case interview',
  'Kepler Cannon case interview', 'Deloitte S&O case interview', 'Oliver Wyman case interview',
  'Roland Berger case interview', 'Arthur D Little case interview', 'ZS Associates case interview',
  'McKinsey BCG Bain', 'McKinsey Kearney LEK', 'tier 2 consulting interview',
  // Mock interviews and practice
  'mock interview', 'mock case interview', 'practice interview', 'interview simulator',
  'live case practice', 'peer case practice', 'voice interview practice',
  // Analytics, feedback and AI agents
  'interview feedback', 'performance analytics', 'interview scoring', 'progress tracking',
  'case interview feedback', 'transcript feedback', 'AI feedback', 'AI case interview',
  'AI interview coach', 'AI mock interview', 'AI first case prep', 'agentic AI interview',
  'AI interview agent', 'auto transcription interview', 'auto recording interview',
  'AI case analysis', 'AI interview insights', 'AI goal tracking', 'AI case feedback',
  'voice AI case interview', 'AI consulting prep',
  // Audience and India
  'case prep India', 'consulting prep India', 'SRCC', 'Delhi University consulting',
  'IIM case prep', 'IIT consulting prep', 'undergraduate consulting prep',
  'MBA case interview prep', 'placement preparation', 'campus placements consulting',
  // Common misspellings and split forms
  'case compendia', 'case compendiam', 'case compedium', 'compendium x',
  'casecompendium', 'case-compendium-x',
  // Hindi and Hinglish phrasings
  'case interview kaise kare', 'consulting kaise join kare', 'case prep kaise kare',
  'consulting interview ki taiyari', 'case study practice hindi',
]

export const metadata: Metadata = {
  metadataBase: new URL('https://www.casecompendiumx.in'),
  title: {
    default: 'Case CompendiumX: Where Case Prep Gets Smarter',
    template: '%s | Case CompendiumX',
  },
  description:
    'The case book a million readers grew up on, now AI first. Agents record and transcribe every mock, analyse it, surface your blind spots and track your goals to the offer. Practice real McKinsey, BCG, Bain, Kearney, L.E.K., Strategy& and Accenture Strategy cases. Built by SRCC students.',
  applicationName: 'Case CompendiumX',
  keywords: CCX_KEYWORDS,
  authors: [{ name: 'Case CompendiumX' }],
  creator: 'Case CompendiumX',
  publisher: 'Case CompendiumX',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'Case CompendiumX',
    title: 'Case CompendiumX: Where Case Prep Gets Smarter',
    description:
      'The case book a million readers grew up on, now AI first. Agents record, transcribe and analyse every mock, surface your blind spots and track your goals to the offer. Real McKinsey, BCG, Bain, Kearney and L.E.K. cases.',
    url: 'https://www.casecompendiumx.in',
    locale: 'en_IN',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'Case CompendiumX',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Case CompendiumX: Where Case Prep Gets Smarter',
    description:
      'The case book a million readers grew up on, now AI first. Agents record, transcribe and analyse every mock, surface blind spots and track your goals to the offer. Real McKinsey, BCG, Bain and Kearney cases.',
    images: ['/logo.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        {/* Material Symbols still loaded from Google Fonts — it's an icon font
            not available via next/font. preconnect is already handled by Next.js
            when using next/font, so only this one external font remains. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL@20..48,100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${newsreader.variable} ${workSans.variable}`}>
        <Analytics />
        <GlobalStyles />
        <OfflineSetup />
        <OfflineBanner />
        {children}
      </body>
    </html>
  )
}
