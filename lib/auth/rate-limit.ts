import { createHash } from "node:crypto";
import { AuthError } from "./session";

interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

export function assertAuthRateLimit(scope: string, key: string, options: RateLimitOptions, now = Date.now()): void {
  const bucketKey = `${scope}:${hashRateLimitKey(key)}`;
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return;
  }

  existing.count += 1;

  if (existing.count > options.limit) {
    throw new AuthError("Too many attempts. Try again later.", 429);
  }
}

export function resetAuthRateLimitForTests(): void {
  buckets.clear();
}

function hashRateLimitKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 24);
}
