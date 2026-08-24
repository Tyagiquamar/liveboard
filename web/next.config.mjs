/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
    return [{ source: '/api-proxy/:path*', destination: `${api.replace(/\/api$/, '')}/:path*` }]
  }
}

export default nextConfig
