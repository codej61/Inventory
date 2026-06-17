import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API calls to the Bun (Hono) server so the browser stays same-origin (no CORS).
  // The Bun API owns everything under /api/*.
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
