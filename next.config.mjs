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
  // Set via the BASE_PATH build ARG (see Dockerfile/docker-compose.yml) when
  // this deployment sits behind a reverse proxy under a subpath — e.g.
  // "/infrastructure" on the office proxy (see dashboard.conf on that host).
  // Empty by default so a plain `next build` still serves from "/".
  basePath: process.env.BASE_PATH || "",
};

export default nextConfig;
