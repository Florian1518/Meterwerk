import { describe, expect, it } from "vitest";
import {
  assertDemoResetAllowed,
  assertStagingIsolation,
  environmentLabel,
  getEnvironment,
} from "@/lib/environment";
import { securityConfigSchema } from "@/server/security-config";
describe("environment isolation", () => {
  it.each(["staging", "demo"])(
    "accepts %s in runtime security configuration",
    (METERWERK_ENV) => {
      expect(
        securityConfigSchema.safeParse({
          METERWERK_ENV,
          APP_URL: "https://meterwerk.invalid",
        }).success,
      ).toBe(true);
    },
  );
  it("recognizes environments", () => {
    expect(getEnvironment("demo")).toBe("demo");
    expect(getEnvironment("production")).toBe("production");
  });
  it("labels only demo and staging", () => {
    expect(environmentLabel("demo")).toBe("DEMO");
    expect(environmentLabel("staging")).toBe("STAGING");
    expect(environmentLabel("production")).toBe("");
  });
  it("guards reset and production endpoints", () => {
    expect(assertDemoResetAllowed("demo", "I_UNDERSTAND_DEMO_RESET")).toBe(
      true,
    );
    expect(() =>
      assertDemoResetAllowed("production", "I_UNDERSTAND_DEMO_RESET"),
    ).toThrow();
    expect(() =>
      assertStagingIsolation("staging", {
        DATABASE_URL: "postgres://staging-db/app",
      }),
    ).not.toThrow();
    expect(() =>
      assertStagingIsolation("staging", {
        DATABASE_URL: "postgres://production-db/app",
      }),
    ).toThrow();
  });
  it("checks MQTT and external storage endpoints in staging/demo", () => {
    expect(() =>
      assertStagingIsolation("staging", {
        MQTT_BROKER_URL: "mqtts://live-broker.invalid",
      }),
    ).toThrow();
    expect(() =>
      assertStagingIsolation("staging", {
        APP_URL: "https://production.meterwerk.invalid",
      }),
    ).toThrow();
    expect(() =>
      assertStagingIsolation("demo", {
        ATTACHMENT_S3_ENDPOINT: "https://storage-production.invalid",
      }),
    ).toThrow();
    expect(() =>
      assertStagingIsolation("staging", {
        MQTT_BROKER_URL: "mqtt://mqtt:1883",
        ATTACHMENT_S3_ENDPOINT: "https://storage-staging.invalid",
      }),
    ).not.toThrow();
  });
});
