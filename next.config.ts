import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to THIS project. Without it, a stray
  // package-lock.json in the home folder makes Next infer ~/ as the root and
  // scan ~/Desktop, which macOS blocks — crashing Turbopack on startup.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
