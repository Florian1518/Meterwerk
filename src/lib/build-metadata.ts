import { getEnvironment } from "./environment";

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function isValidBuildVersion(value: string | undefined): value is string {
  const match = value?.match(SEMVER_PATTERN);
  if (!match) return false;
  const prerelease = match[4];
  return !prerelease
    ?.split(".")
    .some(
      (identifier) =>
        /^\d+$/.test(identifier) &&
        identifier.length > 1 &&
        identifier.startsWith("0"),
    );
}

export function buildMetadata() {
  const environment = getEnvironment();
  return {
    version: isValidBuildVersion(process.env.BUILD_VERSION)
      ? process.env.BUILD_VERSION
      : (process.env.npm_package_version ?? "0.1.0"),
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
