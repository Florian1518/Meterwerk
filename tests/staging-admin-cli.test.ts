import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  disconnect: vi.fn(),
  construct: vi.fn(),
}));
vi.mock("../src/generated/prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      mocks.construct();
    }
    $disconnect = mocks.disconnect;
  },
}));
vi.mock("../src/server/staging-admin", async (original) => ({
  ...(await original<typeof import("../src/server/staging-admin")>()),
  createInitialStagingAdmin: mocks.create,
}));

const argv = process.argv;
const exitCode = process.exitCode;
afterEach(() => {
  process.argv = argv;
  process.exitCode = exitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

it.each(["success", "database-error", "disconnect-error"])(
  "CLI %s never prints password/hash and disconnects",
  async (mode) => {
    vi.resetModules();
    vi.stubEnv("METERWERK_ENV", "staging");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://meterwerk_staging@db:5432/meterwerk_staging",
    );
    process.argv = [
      "node",
      "script",
      "--name",
      "Operator",
      "--email",
      "admin@example.invalid",
      "--password-stdin",
    ];
    const password = "public-test-input-only";
    const hash = "$argon2id$test-output-marker";
    vi.spyOn(process.stdin, "setEncoding").mockReturnValue(process.stdin);
    vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(
      async function* () {
        yield password;
        return undefined;
      },
    );
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    if (mode === "database-error")
      mocks.create.mockRejectedValue(new Error(password + hash));
    else mocks.create.mockResolvedValue({ id: "test-id", passwordHash: hash });
    if (mode === "disconnect-error")
      mocks.disconnect.mockRejectedValue(new Error(password + hash));
    await import("../scripts/staging-create-admin");
    expect(mocks.construct).toHaveBeenCalledOnce();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    const printed = JSON.stringify([output.mock.calls, errors.mock.calls]);
    expect(printed).not.toContain(password);
    expect(printed).not.toContain(hash);
    if (mode === "success")
      expect(output).toHaveBeenCalledWith(
        "Erster Staging-SUPER_ADMIN wurde erstellt.",
      );
    else expect(process.exitCode).toBe(1);
  },
);
