import type { NextConfig } from "next";

/**
 * This repo lives under ~/Desktop, which is iCloud-synced. iCloud races the
 * build and duplicates output directories in place ("server 2", "trace 2"),
 * which Turbopack then trips over with `Unknown system error -11, scandir`
 * or `Resource deadlock avoided (os error 11)` — a build failure that has
 * nothing to do with the code.
 *
 * iCloud skips any path ending in `.nosync`, so local builds write there
 * instead. Vercel's filesystem has no such problem and its build pipeline
 * expects the default, so CI keeps `.next` untouched.
 */
const nextConfig: NextConfig = {
  distDir: process.env.VERCEL ? ".next" : ".next.nosync",
  /**
   * firebase-admin does dynamic `require`s and ships optional native deps, so
   * bundling it produces a function that throws at import time on Vercel —
   * every route importing it returned an empty 500 while the poster routes
   * (which don't import it) were fine. Leaving it external makes Node resolve
   * it from node_modules at runtime instead.
   */
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
