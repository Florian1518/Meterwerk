import { describe, expect, it } from "vitest";
import {
  isAllowedLifecycleTransition,
  lifecycleStatuses,
} from "@/server/device-management";
import { commandTypes, evaluateDeviceHealth } from "@/server/device-fleet";
import { evaluateCompliance } from "@/server/device-fleet-part3";

describe("Device Management", () => {
  it("defines the complete lifecycle and protects terminal decommissioning", () => {
    expect(lifecycleStatuses).toEqual([
      "NEW",
      "PROVISIONING",
      "ACTIVE",
      "OFFLINE",
      "MAINTENANCE",
      "DECOMMISSIONED",
      "FAILED",
    ]);
    expect(isAllowedLifecycleTransition("NEW", "PROVISIONING")).toBe(true);
    expect(isAllowedLifecycleTransition("DECOMMISSIONED", "ACTIVE")).toBe(
      false,
    );
    expect(isAllowedLifecycleTransition("ACTIVE", "NEW")).toBe(false);
  });
  it("calculates health with explainable rules", () => {
    const now = new Date("2026-09-24T10:00:00Z");
    expect(
      evaluateDeviceHealth(
        {
          lastContact: new Date("2026-09-24T09:00:00Z"),
          deviceStatus: "ONLINE",
          errorRate: 0,
          missingMeasurements: false,
          credentialStatus: "ACTIVE",
          provisioningStatus: "SUCCEEDED",
          firmwareUpdateStatus: null,
          openAlarms: 0,
          configurationError: false,
          maintenance: false,
        },
        now,
      ).status,
    ).toBe("HEALTHY");
    expect(
      evaluateDeviceHealth(
        {
          lastContact: new Date("2026-09-22T09:00:00Z"),
          deviceStatus: "OFFLINE",
          errorRate: 0.8,
          missingMeasurements: true,
          credentialStatus: "REVOKED",
          provisioningStatus: "FAILED",
          firmwareUpdateStatus: "FAILED",
          openAlarms: 2,
          configurationError: true,
          maintenance: false,
        },
        now,
      ).status,
    ).toBe("CRITICAL");
  });
  it("allows only the prepared remote command vocabulary", () => {
    expect(commandTypes).toContain("DIAGNOSTICS_REQUEST");
    expect(commandTypes).not.toContain("SHELL");
  });
  it("explains compliance deviations", () => {
    expect(
      evaluateCompliance({
        firmwareVersion: "1",
        desiredFirmwareVersion: "2",
        profileExpected: true,
        configCurrent: true,
        credentialValid: true,
        provisioningOk: true,
      }).status,
    ).toBe("WARNING");
    expect(
      evaluateCompliance({
        firmwareVersion: "1",
        desiredFirmwareVersion: "1",
        profileExpected: true,
        configCurrent: true,
        credentialValid: true,
        provisioningOk: true,
      }).status,
    ).toBe("COMPLIANT");
  });
});
