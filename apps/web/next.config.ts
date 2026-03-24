import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const API_URL = process.env.API_URL || 'http://localhost:3001';

const nextConfig: NextConfig = {
  transpilePackages: ['@minai/shared'],
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
});
