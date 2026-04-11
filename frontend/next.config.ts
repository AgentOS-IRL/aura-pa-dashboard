import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: false,
  webpack: (config) => {
    config.resolve.fallback = { fs: false };
    // Ignore the critical dependencies warnings from onnxruntime-web
    config.module.exprContextCritical = false;
    config.module.unknownContextCritical = false;
    return config;
  },
};

export default nextConfig;
