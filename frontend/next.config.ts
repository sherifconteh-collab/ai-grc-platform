import type { NextConfig } from "next";

// Default to the local backend bundled with the desktop app.
// Admins can override via BACKEND_ORIGIN env var for remote deployments.
const BACKEND_URL =
  process.env.BACKEND_ORIGIN || "http://localhost:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${BACKEND_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
