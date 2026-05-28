import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "maps.googleapis.com"
      }
    ]
  }
};

export default nextConfig;
