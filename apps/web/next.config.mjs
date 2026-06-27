/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile the workspace package (shared types/summary helper).
  transpilePackages: ["@audio-unpack/core"],
  // Allow importing the generated Convex API from the repo-root `convex/` dir.
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
