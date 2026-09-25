import { getEnvironment } from "./environment";
export function buildMetadata() {
  const environment = getEnvironment();
  return {
    version: process.env.npm_package_version ?? "0.1.0",
    commit:
      process.env.GIT_COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      "unknown",
    builtAt: process.env.BUILD_TIMESTAMP ?? "unknown",
    environment,
    label:
      environment === "demo"
        ? "DEMO"
        : environment === "staging"
          ? "STAGING"
          : null,
  };
}
