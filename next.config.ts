import type { NextConfig } from "next";

const appCommit = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_LEZGO_APP_VERSION ?? "").slice(0, 7);
const appEnvironment = process.env.VERCEL_ENV ?? "development";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.60"],
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  env: {
    // The app is served from the domain root on Vercel. Kept as an empty value for code that builds URLs.
    NEXT_PUBLIC_BASE_PATH: "",
    NEXT_PUBLIC_LEZGO_APP_COMMIT: appCommit,
    NEXT_PUBLIC_LEZGO_APP_ENVIRONMENT: appEnvironment,
  },
};

export default nextConfig;
