/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint setup is out of scope for Phase 1/2 (not in the mirrored dependency
  // list) — disabled explicitly so `next build` doesn't prompt for a missing config.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Standalone server bundle (.next/standalone) for a minimal Docker runtime
  // image — see Dockerfile.
  output: "standalone",
};

export default nextConfig;
