import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages serves static files only - no Node server - so the whole app is
  // prerendered to `out/` at build time. Every dynamic route therefore needs
  // generateStaticParams; see src/app/contest/[id]/**.
  output: "export",

  // Emit /contest/2250/index.html instead of /contest/2250.html, so GitHub Pages
  // resolves nested routes without relying on its extension-stripping behaviour.
  trailingSlash: true,

  // The optimizer is a server feature. Nothing here uses next/image today, but this
  // keeps `output: 'export'` from erroring the moment someone adds one.
  images: { unoptimized: true },
};

export default nextConfig;
