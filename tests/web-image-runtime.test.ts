import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
  assertHealthyContainer,
  docker,
  stopContainer,
} from "../scripts/web-image-docker.mjs";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("node:fs", () => ({ mkdirSync: vi.fn(), writeFileSync: vi.fn() }));

const healthy = {
  State: { Running: true, Health: { Status: "healthy" } },
  RestartCount: 0,
};
const exec = vi.mocked(execFileSync);

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Web image Docker verification", () => {
  it.each(["container-id\n", "CLI warning\ncontainer-id\n"])(
    "recognizes successful stop independently of stdout: %s",
    (stdout) => {
      exec
        .mockReturnValueOnce(stdout)
        .mockReturnValueOnce(JSON.stringify([{ State: { Running: false } }]));
      expect(stopContainer("container-id")).toBe(stdout.trim());
      expect(exec).toHaveBeenNthCalledWith(
        1,
        "docker",
        ["stop", "--timeout", "15", "container-id"],
        { encoding: "utf8" },
      );
    },
  );

  it("propagates nonzero Docker exits even with plausible stdout", () => {
    const failure = Object.assign(new Error("Docker failed"), {
      status: 1,
      stdout: "container-id\n",
      stderr: "warning\n",
    });
    exec.mockImplementation(() => {
      throw failure;
    });
    expect(() => stopContainer("container-id")).toThrow(failure);
    expect(() => docker("inspect", "container-id")).toThrow(failure);
  });

  it("rejects a container still running after stop", () => {
    exec
      .mockReturnValueOnce("container-id")
      .mockReturnValueOnce(JSON.stringify([healthy]));
    expect(() => stopContainer("container-id")).toThrow();
  });

  it("reads RestartCount beside State and still rejects restarts or missing data", () => {
    expect(() => assertHealthyContainer(healthy)).not.toThrow();
    expect(() =>
      assertHealthyContainer({ ...healthy, RestartCount: 1 }),
    ).toThrow();
    expect(() => assertHealthyContainer({ State: healthy.State })).toThrow();
    expect(() =>
      assertHealthyContainer({
        ...healthy,
        State: { Running: true, Health: { Status: "unhealthy" } },
      }),
    ).toThrow();
  });
});

describe("complete verifier control flow", () => {
  function setup(failure?: "runtime" | "stop" | "cleanup") {
    vi.resetModules();
    for (const [key, value] of Object.entries({
      METERWERK_WEB_IMAGE: "test-image",
      METERWERK_ENV: "test",
      SEED_DEMO: "true",
      DEMO_PASSWORD: "ci-only-synthetic-demo-password",
      DATABASE_URL: "postgresql://localhost/test",
      GIT_COMMIT_SHA: "test-sha",
      BUILD_TIMESTAMP: "test-timestamp",
    }))
      vi.stubEnv(key, value);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const stopped = new Set<string>();
    exec.mockImplementation((command, args) => {
      const values = args as string[];
      if (command !== "docker") {
        if (failure === "runtime") throw new Error("runtime failed");
        return "";
      }
      if (values[0] === "image")
        return JSON.stringify([
          {
            Config: {
              User: "meterwerk",
              Entrypoint: ["node"],
              Cmd: ["server.js"],
              Labels: {
                "org.opencontainers.image.revision": "test-sha",
                "org.opencontainers.image.created": "test-timestamp",
                "org.opencontainers.image.version": "test-version",
              },
            },
          },
        ]);
      if (values[0] === "run")
        return values.includes("production")
          ? "production-id"
          : values.some((v) => v.includes("production-health"))
            ? "production-id"
            : "test-id";
      if (values[0] === "inspect") {
        const container = {
          ...healthy,
          State: { ...healthy.State, Running: !stopped.has(values.at(-1)!) },
        };
        return JSON.stringify(
          values.includes("--format") ? container.State : [container],
        );
      }
      if (values[0] === "stop") {
        if (failure === "stop") throw new Error("stop failed");
        stopped.add(values.at(-1)!);
        return "warning\ncontainer-id";
      }
      if (values[0] === "rm" && failure === "cleanup")
        throw new Error("cleanup failed");
      return "container-id";
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string, options?: { headers?: Record<string, string> }) => {
          if (url.endsWith("/login"))
            return new Response(null, {
              status: 308,
              headers: { location: "https://localhost/login" },
            });
          if (options?.headers?.host === "attacker.example")
            return new Response(null, { status: 421 });
          return Response.json({ version: "test-version", commit: "test-sha" });
        },
      ),
    );
  }

  it("passes both smoke phases and stops/removes both containers before reporting", async () => {
    setup();
    await import("../scripts/verify-web-image-runtime.mjs");
    const calls = exec.mock.calls.map(([, args]) => args as string[]);
    expect(calls.filter((args) => args[0] === "stop")).toHaveLength(2);
    expect(calls.filter((args) => args[0] === "rm")).toHaveLength(2);
    expect(writeFileSync).toHaveBeenCalledOnce();
    expect(
      vi.mocked(writeFileSync).mock.invocationCallOrder[0],
    ).toBeGreaterThan(exec.mock.invocationCallOrder.at(-1)!);
  });

  it.each(["runtime", "stop", "cleanup"] as const)(
    "fails on %s errors, attempts cleanup, and never reports PASSED",
    async (failure) => {
      setup(failure);
      await expect(
        import("../scripts/verify-web-image-runtime.mjs"),
      ).rejects.toThrow(`${failure} failed`);
      expect(
        exec.mock.calls.some(([, args]) => (args as string[])[0] === "rm"),
      ).toBe(true);
      expect(writeFileSync).not.toHaveBeenCalled();
    },
  );
});
