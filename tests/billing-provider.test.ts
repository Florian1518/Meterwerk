import { describe, expect, it } from "vitest";
import {
  billingPrice,
  type BillingEvent,
  type BillingProvider,
} from "@/server/billing/provider";

describe("provider neutral SaaS billing boundary", () => {
  it("keeps exact decimal strings and both billing intervals", () => {
    expect(billingPrice("1200.05", "EUR", "YEARLY")).toEqual({
      amount: "1200.05",
      currency: "EUR",
      interval: "YEARLY",
    });
    expect(billingPrice("49", "USD", "MONTHLY").amount).toBe("49");
  });
  it("rejects floats formatted as non-decimal metadata and invalid currency", () => {
    expect(() => billingPrice("49,99", "EUR", "MONTHLY")).toThrow(TypeError);
    expect(() => billingPrice("49.999", "EUR", "MONTHLY")).toThrow(TypeError);
    expect(() => billingPrice("49.99", "EURO", "MONTHLY")).toThrow(TypeError);
  });
  it("exposes normalized provider events and adapter methods", () => {
    const event: BillingEvent = {
      eventId: "event-1",
      subscriptionId: "subscription-1",
      status: "PAST_DUE",
      occurredAt: new Date(),
    };
    expect(event.status).toBe("PAST_DUE");
    expect([
      "createOrUpdateCustomer",
      "createCheckout",
      "cancel",
      "parseEvent",
    ] satisfies (keyof BillingProvider)[]).toHaveLength(4);
  });
});
