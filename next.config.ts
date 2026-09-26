import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Anexos de até 8 MB sobem por server action (D2); o padrão é 1 MB.
    serverActions: { bodySizeLimit: "9mb" },
  },
};

export default nextConfig;
