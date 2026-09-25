import "server-only";
import { db } from "./db";

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};
export interface DistributedRateLimiter {
  consume(
    key: string,
    limit: number,
    windowSeconds: number,
    now?: Date,
  ): Promise<RateLimitDecision>;
  health(): Promise<{ available: boolean; backend: string }>;
}

/** PostgreSQL-backed implementation for multi-instance deployments. The unique key
 * and atomic upsert make the counter shared across all web workers. */
export class PostgresRateLimiter implements DistributedRateLimiter {
  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
    now = new Date(),
  ): Promise<RateLimitDecision> {
    const resetAt = new Date(now.getTime() + windowSeconds * 1000);
    const [row] = await db.$queryRaw<
      Array<{ attempts: number; resetAt: Date }>
    >`
      INSERT INTO "LoginLimit" ("key", "attempts", "resetAt") VALUES (${`rl:${key}`}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "LoginLimit"."resetAt" <= ${now} THEN 1 ELSE "LoginLimit"."attempts" + 1 END,
        "resetAt" = CASE WHEN "LoginLimit"."resetAt" <= ${now} THEN ${resetAt} ELSE "LoginLimit"."resetAt" END
      RETURNING "attempts", "resetAt"`;
    const retry = Math.max(
      1,
      Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000),
    );
    return {
      allowed: row.attempts <= limit,
      remaining: Math.max(0, limit - row.attempts),
      retryAfterSeconds: retry,
    };
  }
  async health() {
    try {
      await db.$queryRaw`SELECT 1`;
      return { available: true, backend: "postgres" };
    } catch {
      return { available: false, backend: "postgres" };
    }
  }
}

export class LocalRateLimiter implements DistributedRateLimiter {
  private readonly buckets = new Map<
    string,
    { attempts: number; resetAt: number }
  >();
  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
    now = new Date(),
  ) {
    const current = this.buckets.get(key);
    const resetAt =
      current && current.resetAt > now.getTime()
        ? current.resetAt
        : now.getTime() + windowSeconds * 1000;
    const attempts =
      current && current.resetAt > now.getTime() ? current.attempts + 1 : 1;
    this.buckets.set(key, { attempts, resetAt });
    return {
      allowed: attempts <= limit,
      remaining: Math.max(0, limit - attempts),
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((resetAt - now.getTime()) / 1000),
      ),
    };
  }
  async health() {
    return { available: true, backend: "local-development" };
  }
}

let configured: DistributedRateLimiter | undefined;
export function rateLimiter() {
  return (configured ??=
    process.env.RATE_LIMIT_BACKEND === "local"
      ? new LocalRateLimiter()
      : new PostgresRateLimiter());
}
export function setRateLimiterForTests(
  value: DistributedRateLimiter | undefined,
) {
  configured = value;
}
