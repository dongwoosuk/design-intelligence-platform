/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'brqjvuyjxivmvllxztsv.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Required for @xenova/transformers to work in API routes
  experimental: {
    serverComponentsExternalPackages: ['@xenova/transformers', 'onnxruntime-node'],
  },
  webpack: (config, { isServer }) => {
    // Handle native modules for transformers.js
    if (isServer) {
      config.externals = [...(config.externals || []), '@xenova/transformers']
    }

    // Ignore binary files
    config.module.rules.push({
      test: /\.node$/,
      use: 'ignore-loader',
    })

    return config
  },
}

module.exports = nextConfig
