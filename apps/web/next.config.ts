import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API calls to the Bun (Hono) server (same-origin, no CORS).
  // Bun/Hono API is namespaced under /api/bun/*; Next owns the rest of /api/*.
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:3001";
    return [
      {
        // Bun/Hono API is namespaced under /api/bun/* so Next owns the rest of /api/*
        source: "/api/bun/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
