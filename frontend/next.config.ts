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
      {
        // The realtime client connects to this page's own origin
        // (getSocketServerUrl), so Socket.IO must be proxied too. Next.js
        // redirects "/socket.io/" to "/socket.io", so the client uses the
        // bare path (addTrailingSlash: false), which the backend accepts.
        source: "/socket.io",
        destination: `${BACKEND_URL}/socket.io`,
      },
    ];
  },
};

export default nextConfig;
