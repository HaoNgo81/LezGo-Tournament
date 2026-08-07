import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: isGitHubPages ? "export" : undefined,
  basePath: isGitHubPages ? "/LezGo-Tournament" : undefined,
  trailingSlash: isGitHubPages ? true : undefined,
};

export default nextConfig;
