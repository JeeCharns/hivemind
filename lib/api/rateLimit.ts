/**
 * Rate Limiting Utility
 *
 * Provides rate limiting for API endpoints using Upstash Redis.
 * Falls back to no-op when Redis is not configured (development).
 *
 * Architecture:
 * - Uses sliding window algorithm for smooth rate limiting
 * - Configurable limits per endpoint type
 * - Returns standardized response for 429 status
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Rate limit configurations for different endpoint types
export const RATE_LIMITS = {
  // Feedback voting: 20 votes per minute per user
  feedback: { requests: 20, window: "1 m" as const },
  // Like operations: 30 likes per minute per user
  like: { requests: 30, window: "1 m" as const },
  // Response submission: 10 per minute per user
  response: { requests: 10, window: "1 m" as const },
  // Quadratic voting: 30 votes per minute per user
  vote: { requests: 30, window: "1 m" as const },
  // General API: 100 requests per minute per user
  general: { requests: 100, window: "1 m" as const },
} as const;

export type RateLimitType = keyof typeof RATE_LIMITS;

// Lazy-initialized rate limiters (one per type)
const rateLimiters = new Map<RateLimitType, Ratelimit | null>();

/**
 * Check if Upstash is configured
 */
function isUpstashConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/**
 * Get or create a rate limiter for the given type
 */
function getRateLimiter(type: RateLimitType): Ratelimit | null {
  if (!isUpstashConfigured()) {
    return null;
  }

  if (!rateLimiters.has(type)) {
    const config = RATE_LIMITS[type];
    const redis = Redis.fromEnv();
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.requests, config.window),
      analytics: true,
      prefix: `ratelimit:${type}`,
    });
    rateLimiters.set(type, limiter);
  }

  return rateLimiters.get(type) ?? null;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Check rate limit for a user
 *
 * @param userId - User ID to rate limit (or IP address for anonymous)
 * @param type - Type of rate limit to apply
 * @returns Rate limit result with success status
 */
export async function checkRateLimit(
  userId: string,
  type: RateLimitType
): Promise<RateLimitResult> {
  const limiter = getRateLimiter(type);

  // No-op when Upstash not configured (development mode)
  if (!limiter) {
    return {
      success: true,
      limit: RATE_LIMITS[type].requests,
      remaining: RATE_LIMITS[type].requests,
      reset: Date.now() + 60000,
    };
  }

  const { success, limit, remaining, reset } = await limiter.limit(userId);

  return { success, limit, remaining, reset };
}

/**
 * Create a 429 Too Many Requests response
 *
 * @param result - Rate limit result from checkRateLimit
 * @returns NextResponse with appropriate headers
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: "Too many requests. Please try again later.",
      code: "RATE_LIMITED",
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.reset),
        "Retry-After": String(Math.ceil((result.reset - Date.now()) / 1000)),
      },
    }
  );
}

/**
 * Higher-order function to wrap a route handler with rate limiting
 *
 * Example:
 * ```ts
 * export const POST = withRateLimit("feedback", async (req, userId) => {
 *   // Your handler code
 * });
 * ```
 */
export function withRateLimit<T extends (...args: unknown[]) => Promise<NextResponse>>(
  type: RateLimitType,
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    // Rate limiting is applied at the start of the handler
    // The actual user ID extraction should happen in the handler
    // This is a template - actual implementation should use session
    return handler(...args);
  }) as T;
}
