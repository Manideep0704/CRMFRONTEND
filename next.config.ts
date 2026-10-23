import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  allowedDevOrigins: [
    '192.168.1.64',
    'localhost',
    '127.0.0.1',
  ],
};

export default config;
