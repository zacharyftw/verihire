/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@verihire/types', '@verihire/utils'],
  experimental: {
    typedRoutes: true,
  },
};

module.exports = nextConfig;
