import path from "node:path";
import type { NextConfig } from "next";

const apiProxyTarget =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.API_BASE_URL ??
  "http://127.0.0.1:8765";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
