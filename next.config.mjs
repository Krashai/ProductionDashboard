// Set via the BASE_PATH build ARG (see Dockerfile/docker-compose.yml) when
// this deployment sits behind a reverse proxy under a subpath — e.g.
// "/infrastructure" on the office proxy (see dashboard.conf on that host).
// Empty by default so a plain `next build` still serves from "/".
const basePath = process.env.BASE_PATH || "";

// Where the Next.js *server* reaches the PLC backend — never sent to the
// browser. The browser always connects same-origin to `${basePath}/ws`
// (see src/lib/backend/config.ts) and this rewrite forwards the WebSocket
// upgrade from there. That is what makes one build work from both networks:
// through the office proxy the proxy handles `/infrastructure/ws` itself,
// while on the OT subnet (10.10.0.x) this server does. Baked into the
// routes manifest at build time, so it is a build ARG like BASE_PATH.
const backendInternalUrl = (process.env.BACKEND_INTERNAL_URL || "http://localhost:8001").replace(
  /\/+$/,
  ""
);

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
  basePath,
  // Same BASE_PATH, handed to the browser bundle so the WS URL is derived
  // from the one switch that also sets basePath — they can't drift apart.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  async rewrites() {
    return {
      // beforeFiles: must win before Next tries to match a page or file.
      // `source` is relative to basePath (Next prefixes it automatically).
      beforeFiles: [{ source: "/ws", destination: `${backendInternalUrl}/ws` }],
    };
  },
  async redirects() {
    // With a basePath the bare root 404s — someone typing the Pi's address
    // directly on the local network would land there. Behind the proxy "/"
    // belongs to LineGantt and never reaches this server, so this only
    // affects direct access. Temporary (307), so browsers don't cache it.
    return basePath
      ? [{ source: "/", destination: basePath, basePath: false, permanent: false }]
      : [];
  },
};

export default nextConfig;
