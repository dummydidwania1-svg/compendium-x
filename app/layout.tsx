import type { Metadata } from 'next'
import GlobalStyles from '@/components/GlobalStyles'
import Analytics from '@/components/Analytics';
import OfflineSetup from '@/components/OfflineSetup'
import OfflineBanner from '@/components/OfflineBanner'
// @ts-ignore - CSS side-effect import is supported by Next.js
import './globals.css'

export const metadata: Metadata = {
  title: 'Case CompendiumX',
  description:
    'Run realistic case interviews, capture transcript-backed feedback, and build a long-term improvement record with Compendium X.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&family=Work+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Analytics />
        <GlobalStyles />
        <OfflineSetup />
        <OfflineBanner />
        {children}
      </body>
    </html>
  )
}
