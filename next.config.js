/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'agentic-346972db.vercel.app'
      ]
    }
  }
};

module.exports = nextConfig;
