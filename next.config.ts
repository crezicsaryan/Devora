import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next.js 16 blocks its development-only resources (the HMR socket under
   * /_next/hmr, and /__nextjs_font/*) when the request arrives from an origin
   * it does not recognise.
   *
   * Opening the app at http://127.0.0.1:3000 instead of http://localhost:3000
   * therefore breaks the dev client: React never hydrates, so every onClick in
   * the app silently does nothing — including "Continue with Google", which
   * looks like the button is dead.
   *
   * Both hostnames point at the same machine, so both must be allowed here.
   * This only affects `next dev`; it has no effect on a production build.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
