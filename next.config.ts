import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    serverActions: {
      // A sales CSV travels in the body of a Server Action. MAX_CSV_BYTES (4 MB)
      // in lib/validation/imports.ts stays under this and under Vercel's limit.
      bodySizeLimit: "4500kb",
    },
  },
  turbopack: {
    // Pin the workspace root to this project; a lockfile in a parent folder must not win.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
