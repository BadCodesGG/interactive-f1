import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Model files carry a content hash in their name (npm run fixture writes fixture.<hash>.glb), so a
  // changed model is a new URL and the old one can be cached forever.
  async headers() {
    return [
      {
        // No sniffing, no full URLs to other sites, and only the portfolio (badcodes.dev) may frame the pages.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://badcodes.dev https://www.badcodes.dev" },
        ],
      },
      {
        source: "/models/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
