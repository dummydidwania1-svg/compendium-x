import type { NextConfig } from "next";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DefinePlugin } = require("webpack");

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

  webpack: (config) => {
    config.plugins ??= [];
    config.plugins.push(
      new DefinePlugin({
        "import.meta.env.VITE_GEMINI_API_KEY": JSON.stringify(
          process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "",
        ),
      }),
    );

    return config;
  },
};

export default nextConfig;
