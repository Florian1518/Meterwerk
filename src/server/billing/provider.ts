/** Provider neutral boundary for a future billing integration. No provider is configured here. */
export type BillingInterval = "MONTHLY" | "YEARLY";
export type BillingSubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "SUSPENDED"
  | "CANCELED";

export type BillingCustomerInput = {
  tenantId: string;
  email: string | null;
  name: string | null;
  company: string | null;
  address: string | null;
};

export type BillingPrice = {
  amount: string;
  currency: string;
  interval: BillingInterval;
};

export type BillingEvent = {
  eventId: string;
  subscriptionId: string;
  status: BillingSubscriptionStatus;
  occurredAt: Date;
  interval?: BillingInterval;
  price?: BillingPrice;
};

export type BillingCheckout = {
  externalBillingId: string;
  redirectUrl: string;
};

/** Implementations translate these stable concepts to Stripe, a local invoice service, etc. */
export interface BillingProvider {
  readonly name: string;
  createOrUpdateCustomer(
    input: BillingCustomerInput,
  ): Promise<{ externalCustomerId: string }>;
  createCheckout(input: {
    externalCustomerId: string;
    price: BillingPrice;
    tenantId: string;
    subscriptionId: string;
  }): Promise<BillingCheckout>;
  cancel(externalBillingId: string): Promise<void>;
  parseEvent(request: Request): Promise<BillingEvent>;
}

/** SaaS billing data intentionally has no dependency on Tariff, Meter, or energy costs. */
export function billingPrice(
  amount: string,
  currency: string,
  interval: BillingInterval,
): BillingPrice {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount))
    throw new TypeError(
      "Billing amount must be a decimal string with at most two fractional digits.",
    );
  if (!/^[A-Z]{3}$/.test(currency))
    throw new TypeError("Billing currency must be a three-letter ISO code.");
  return { amount, currency, interval };
}
