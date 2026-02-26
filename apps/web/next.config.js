/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@verihire/types', '@verihire/utils'],
  experimental: {},
};

module.exports = nextConfig;
