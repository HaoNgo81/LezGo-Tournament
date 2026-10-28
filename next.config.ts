import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const appCommit = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_LEZGO_APP_VERSION ?? "").slice(0, 7);
const appEnvironment = process.env.VERCEL_ENV ?? "development";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.60"],
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: isGitHubPages ? "export" : undefined,
  basePath: isGitHubPages ? "/LezGo-Tournament" : undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: isGitHubPages ? "/LezGo-Tournament" : "",
    NEXT_PUBLIC_LEZGO_APP_COMMIT: appCommit,
    NEXT_PUBLIC_LEZGO_APP_ENVIRONMENT: appEnvironment,
  },
  trailingSlash: isGitHubPages ? true : undefined,
};

export default nextConfig;
