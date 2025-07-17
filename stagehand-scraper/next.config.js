/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@browserbasehq/stagehand', 'playwright-core', 'playwright', 'ws'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('playwright-core', 'playwright', 'ws');
    }
    return config;
  },
}

module.exports = nextConfig