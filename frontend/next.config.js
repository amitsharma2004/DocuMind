/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker standalone build (copies only necessary files)
  output: 'standalone',

  // Allow large file uploads (50 MB)
  api: {
    bodyParser: {
      sizeLimit: '52mb',
    },
    responseLimit: false,
  },
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
  },
};

module.exports = nextConfig;
