import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Custom server (server.mjs) handles Socket.IO alongside Next.
  reactStrictMode: true,
};

export default nextConfig;
