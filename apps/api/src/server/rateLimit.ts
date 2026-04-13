/**
 * rateLimit.ts — tiny in-memory token-bucket middleware.
 *
 * Purpose: protect /plan from a cost blowup if somebody hammers the
 * endpoint in a loop, since every hit is a Gemini call. This is NOT a
 * DoS defense — for that you want a reverse proxy. This is a cost guard.
 *
 * Keyed by client IP (best-effort via x-forwarded-for then req.ip).
 */

import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

interface Options {
  windowMs: number;
  max: number;
  label: string;
}

export function rateLimit(opts: Options) {
  const buckets = new Map<string, Bucket>();
  const refillPerMs = opts.max / opts.windowMs;

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const key =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.ip ||
      "unknown";

    const now = Date.now();
    const existing = buckets.get(key);
    let bucket: Bucket;
    if (existing) {
      const elapsed = now - existing.lastRefillMs;
      bucket = {
        tokens: Math.min(opts.max, existing.tokens + elapsed * refillPerMs),
        lastRefillMs: now,
      };
    } else {
      bucket = { tokens: opts.max, lastRefillMs: now };
    }

    if (bucket.tokens < 1) {
      logger.warn({ key, label: opts.label }, "rate-limit: rejecting");
      res.status(429).json({
        error: "rate_limited",
        label: opts.label,
        retry_after_ms: Math.ceil((1 - bucket.tokens) / refillPerMs),
      });
      return;
    }

    bucket.tokens -= 1;
    buckets.set(key, bucket);
    next();
  };
}
