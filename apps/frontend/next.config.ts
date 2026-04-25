import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath: '/moms',
  async redirects() {
    return [
      { source: '/', destination: '/moms', permanent: false, basePath: false }
    ];
  }
};

export default nextConfig;
