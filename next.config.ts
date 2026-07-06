import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Paquetes que deben ejecutarse en Node y no ser bundleados por el server de Next.
  serverExternalPackages: ["@prisma/client", "bcryptjs", "pg"],
  turbopack: {},
};

export default nextConfig;
