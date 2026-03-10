import type { NextConfig } from "next";

const BACKEND_URL =
  process.env.BACKEND_ORIGIN || "https://controlweave-pro-production.up.railway.app";

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
