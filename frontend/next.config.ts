import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Allow base64 data URLs (used for building crop images)
    dangerouslyAllowSVG: false,
    unoptimized: true,
  },
};



export default nextConfig;
