import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/__/auth/:path*',
        destination: 'https://compendium-x.firebaseapp.com/__/auth/:path*',
      },
    ]
  },

  // Serve modern image formats (WebP/AVIF) automatically for next/image.
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },

  // Tree-shake heavy packages — only imports actually used end up in the bundle.
  // Firebase ships dozens of modules; this alone can halve its bundle footprint.
  experimental: {
    optimizePackageImports: [
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage',
      'recharts',
    ],
  },

  // NOTE: the old DefinePlugin that inlined NEXT_PUBLIC_GEMINI_API_KEY into the
  // client bundle was removed deliberately — AI calls now go through
  // /api/feedback-analyser (server-side, authenticated), so no key belongs in
  // browser code. See lib/feedbackAnalyserServer.ts.
};

export default nextConfig;
