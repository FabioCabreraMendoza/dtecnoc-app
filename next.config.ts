import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs", "@xenova/transformers"],
  experimental: {
    optimizePackageImports: ["groq-sdk"],
  },
  turbopack: {},
};

export default nextConfig;
