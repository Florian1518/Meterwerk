import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  bootstrapErrorMessage,
  parseBootstrapArguments,
  readBootstrapPassword,
  validateBootstrapEnvironment,
} from "../src/server/staging-admin";

const target = "postgresql://meterwerk_staging@db:5432/meterwerk_staging";
const args = [
  "--name",
  " Operator ",
  "--email",
  " ADMIN@EXAMPLE.INVALID ",
  "--password-stdin",
];
describe("staging admin guards", () => {
  it.each([undefined, "development", "test", "demo", "production", "STAGING"])(
    "refuses environment %s",
    (METERWERK_ENV) => {
      expect(() =>
        validateBootstrapEnvironment({ METERWERK_ENV, DATABASE_URL: target }),
      ).toThrow("METERWERK_ENV=staging");
    },
  );
  it("requires a database URL and exact configured target", () => {
    expect(() =>
      validateBootstrapEnvironment({ METERWERK_ENV: "staging" }),
    ).toThrow("DATABASE_URL fehlt");
    expect(
      validateBootstrapEnvironment({
        METERWERK_ENV: "staging",
        DATABASE_URL: target,
      }),
    ).toBe(target);
    for (const url of [
      "invalid",
      target.replace("@db", "@production"),
      target.replace("5432", "5433"),
      target + "?host=production",
      target + "#fragment",
      target.replace("/meterwerk_staging", "/other"),
      target.replace("meterwerk_staging@", "other@"),
    ])
      expect(() =>
        validateBootstrapEnvironment({
          METERWERK_ENV: "staging",
          DATABASE_URL: url,
        }),
      ).toThrow();
  });
  it("normalizes identity and rejects invalid or missing fields", () => {
    expect(parseBootstrapArguments(args)).toEqual({
      name: "Operator",
      email: "admin@example.invalid",
    });
    for (const invalid of [
      [],
      ["--password-stdin"],
      [...args, "--password", "never-accepted"],
      [...args, "--password=never-accepted"],
      [...args, "--role", "SUPER_ADMIN"],
      [...args, "--tenantId", "foreign-tenant"],
      [...args, "--userId", "foreign-user"],
      args.map((x) => (x === " Operator " ? " " : x)),
      args.map((x) => (x.includes("ADMIN@") ? "bad" : x)),
      args.map((x) => (x === " Operator " ? "x".repeat(121) : x)),
    ])
      expect(() => parseBootstrapArguments(invalid)).toThrow();
  });
  it("reads only bounded single-line stdin passwords", async () => {
    for (const n of [14, 128])
      expect(
        await readBootstrapPassword(Readable.from(["x".repeat(n), "\r\n"])),
      ).toHaveLength(n);
    for (const value of [
      "x".repeat(13),
      "x".repeat(129),
      "x".repeat(1025),
      "x".repeat(14) + "\nextra",
    ])
      await expect(
        readBootstrapPassword(Readable.from([value])),
      ).rejects.toThrow("Passwort muss");
  });
  it("redacts arbitrary database/hash errors and CLI argv", () => {
    const marker = "sensitive-test-marker";
    expect(bootstrapErrorMessage(new Error(marker))).not.toContain(marker);
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/staging-create-admin.ts",
        ...args,
        "--password",
        marker,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, METERWERK_ENV: "staging", DATABASE_URL: target },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(marker);
    expect(result.stdout + result.stderr).not.toContain("argon2");
  });
  it("ships runtime dependencies and preserves inert defaults", () => {
    const docker = readFileSync("Dockerfile.migrations", "utf8");
    for (const file of [
      "scripts/staging-create-admin.ts",
      "src/server/password.ts",
      "src/server/staging-admin.ts",
      "src/server/staging-database.mjs",
    ])
      expect(docker).toContain(file);
    expect(docker).toContain("pnpm exec prisma generate");
    expect(docker).toContain('CMD ["pnpm", "exec", "prisma", "--version"]');
    expect(readFileSync("compose.staging.external.yaml", "utf8")).toContain(
      "command: [pnpm, exec, prisma, migrate, status]",
    );
    const cli = readFileSync("scripts/staging-create-admin.ts", "utf8");
    expect(cli).toContain("$disconnect()");
    expect(cli).toContain(
      'console.log("Erster Staging-SUPER_ADMIN wurde erstellt.")',
    );
  });
});
