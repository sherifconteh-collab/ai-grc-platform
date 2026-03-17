import type { NextConfig } from "next";

const BACKEND_URL =
  process.env.BACKEND_ORIGIN || "http://localhost:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: "build",
  turbopack: {
    root: process.cwd(),
  },
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
