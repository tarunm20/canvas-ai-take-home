/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@browserbasehq/stagehand', 'playwright-core', 'playwright'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('playwright-core', 'playwright');
    }
    return config;
  },
}

module.exports = nextConfig