import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.2dehands.be' },
      { protocol: 'https', hostname: '**.marktplaats.com' },
      { protocol: 'https', hostname: '**.autoscout24.be' },
      { protocol: 'https', hostname: 'prod.pictures.autoscout24.net' },
    ],
  },
};

export default config;
