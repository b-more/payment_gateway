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
      // Short, shareable link a developer can be sent directly.
      { source: '/postman', destination: '/instacompay-gateway.postman_collection.json' },
    ];
  },
  // Force the collection to DOWNLOAD as a file rather than render as JSON in the
  // browser tab — otherwise a developer has to right-click → Save As and can end
  // up with the wrong filename/extension, which Postman then won't import.
  async headers() {
    const asAttachment = [
      {
        key: 'Content-Disposition',
        value: 'attachment; filename="instacompay-gateway.postman_collection.json"',
      },
      { key: 'Cache-Control', value: 'public, max-age=300' },
    ];
    return [
      { source: '/postman', headers: asAttachment },
      { source: '/instacompay-gateway.postman_collection.json', headers: asAttachment },
    ];
  },
};

export default nextConfig;
