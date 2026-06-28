import type { NextConfig } from 'next';

// `standalone` produces a self-contained server bundle for a slim runtime
// image (DEP-3). Type-checking runs during build; ESLint is run separately.
const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
