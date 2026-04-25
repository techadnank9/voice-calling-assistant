import type { NextConfig } from 'next';

const OPS_PAGES = ['orders', 'calls', 'reservations', 'reports', 'earnings', 'settings', 'support'];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/moms', destination: '/overview' },
      ...OPS_PAGES.map((p) => ({ source: `/moms/${p}`, destination: `/${p}` }))
    ];
  }
};

export default nextConfig;
