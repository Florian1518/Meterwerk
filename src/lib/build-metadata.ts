export function buildMetadata() {
  return {
    version: process.env.npm_package_version ?? "0.1.0",
    commit:
      process.env.GIT_COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      "unknown",
    builtAt: process.env.BUILD_TIMESTAMP ?? "unknown",
    environment: process.env.NODE_ENV ?? "development",
  };
}
