import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingIncludes: {
    "/*": ["./content/oppositions/**/*.json", "./content/imported/**/*.json"]
  }
};

export default nextConfig;
