import type { NextConfig } from "next";

const rawAuraBasePath = process.env.NEXT_PUBLIC_AURA_BASE_PATH ?? "/aura";
const normalizedAuraBasePath = (() => {
  const trimmed = rawAuraBasePath.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }

  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, "");
})();

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: false,
  ...(normalizedAuraBasePath
    ? {
        basePath: normalizedAuraBasePath,
        assetPrefix: normalizedAuraBasePath
      }
    : {}),
  webpack: (config) => {
    config.resolve.fallback = { fs: false };
    // Ignore the critical dependencies warnings from onnxruntime-web
    config.module.exprContextCritical = false;
    config.module.unknownContextCritical = false;
    return config;
  },
};

export default nextConfig;
