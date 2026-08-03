import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for GitHub Pages — writes the site to out/.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
