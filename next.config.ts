import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: the create-next-app scaffold set `cacheComponents: true` and
  // `partialPrefetching: true`. Both were removed: Cache Components
  // enables PPR, and PPR is incompatible with `output: 'export'`
  // ("Invariant: PPR cannot be enabled in export mode"). A plain
  // static export needs neither — every page is fully prerendered
  // at build time.
  // Static export: every page is prerendered HTML at build time.
  // No server, no API routes, no runtime data fetching — same pattern
  // as usaeconomynow.com (Vercel + Next.js, data baked at build).
  output: "export",
};

export default nextConfig;
