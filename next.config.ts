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
