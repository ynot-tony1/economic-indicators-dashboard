import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server (.next/standalone) so the Cloud Run image
  // only needs the traced runtime files, not the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
