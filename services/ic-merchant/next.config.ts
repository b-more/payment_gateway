import type { NextConfig } from 'next';

// `standalone` produces a self-contained server bundle for a slim runtime
// image (DEP-3). Type-checking runs during build; ESLint is run separately.
const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Clean URLs for the static developer guides in public/ (DEV-DOCS).
  async rewrites() {
    return [
      { source: '/developers', destination: '/developers.html' },
      { source: '/partners', destination: '/partners.html' },
    ];
  },
};

export default nextConfig;
