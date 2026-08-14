import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.60"],
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: isGitHubPages ? "export" : undefined,
  basePath: isGitHubPages ? "/LezGo-Tournament" : undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: isGitHubPages ? "/LezGo-Tournament" : "",
  },
  trailingSlash: isGitHubPages ? true : undefined,
};

export default nextConfig;
