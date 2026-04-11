import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the monorepo root (two levels above apps/web) so Turbopack
    // doesn't pick up a stray lockfile in the user's home dir.
    root: path.resolve(__dirname, "..", ".."),
  },
};

export default nextConfig;
