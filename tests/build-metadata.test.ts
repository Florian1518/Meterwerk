import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMetadata } from "../src/lib/build-metadata";

describe("buildMetadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses a valid explicit release build version", () => {
    vi.stubEnv("BUILD_VERSION", "1.0.0-rc.4");
    vi.stubEnv("npm_package_version", "0.1.0");

    expect(buildMetadata().version).toBe("1.0.0-rc.4");
  });

  it("prefers BUILD_VERSION over npm_package_version", () => {
    vi.stubEnv("BUILD_VERSION", "1.0.0-rc.4");
    vi.stubEnv("npm_package_version", "0.1.0");

    expect(buildMetadata().version).toBe("1.0.0-rc.4");
  });

  it("accepts numeric identifiers in build metadata", () => {
    vi.stubEnv("BUILD_VERSION", "1.0.0+build-01");

    expect(buildMetadata().version).toBe("1.0.0+build-01");
  });

  it("falls back to the local development version when unset", () => {
    vi.stubEnv("BUILD_VERSION", "");
    vi.stubEnv("npm_package_version", undefined);
    vi.stubEnv("METERWERK_ENV", "development");

    expect(buildMetadata().version).toBe("0.1.0");
  });

  it("preserves the configured commit SHA and build timestamp", () => {
    vi.stubEnv("GIT_COMMIT_SHA", "b0d76b3592a865e92f7bf56c96140d5a4ec9a361");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "other-sha");
    vi.stubEnv("BUILD_TIMESTAMP", "2026-10-20T10:00:00.000Z");

    expect(buildMetadata()).toMatchObject({
      commit: "b0d76b3592a865e92f7bf56c96140d5a4ec9a361",
      builtAt: "2026-10-20T10:00:00.000Z",
    });
  });
});
