import type { MiddlewareFn, RateLimitEntry, RateLimitOptions } from "../types";
import type { OxarionRequest } from "../handler/request";

export function rateLimit(options: RateLimitOptions): MiddlewareFn {
  if (typeof options !== "object" || options === null)
    throw new TypeError("[Oxarion] rateLimit: options must be an object");
  if (
    typeof options.limit !== "number" ||
    !Number.isInteger(options.limit) ||
    options.limit <= 0
  )
    throw new TypeError(
      "[Oxarion] rateLimit: limit must be a positive integer",
    );
  if (
    typeof options.windowMs !== "number" ||
    !Number.isFinite(options.windowMs) ||
    options.windowMs <= 0
  )
    throw new TypeError(
      "[Oxarion] rateLimit: windowMs must be a positive number",
    );

  const status_code = options.statusCode ?? 429;
  const message = options.message ?? "Too Many Requests";
  const include_headers = options.includeHeaders ?? true;

  const bucket_map: Map<string, RateLimitEntry> = new Map();
  let last_cleanup_ms = Date.now();
  const cleanup_interval_ms = Math.max(options.windowMs * 2, 30_000);

  function default_key(req: OxarionRequest<any>): string {
    const headers = req.getHeaders();
    const xff = headers["x-forwarded-for"];
    if (xff) {
      const first = xff.split(",")[0];
      if (first) return first.trim();
    }
    return headers["x-real-ip"] || "unknown";
  }

  const key_generator = options.keyGenerator ?? default_key;

  return async (req, res, next) => {
    const now_ms = Date.now();

    if (now_ms - last_cleanup_ms > cleanup_interval_ms) {
      last_cleanup_ms = now_ms;
      for (const [k, v] of bucket_map)
        if (v.resetAtMs <= now_ms) bucket_map.delete(k);
    }

    const key = key_generator(req);
    const existing = bucket_map.get(key);

    let entry: RateLimitEntry;
    if (!existing || existing.resetAtMs <= now_ms) {
      entry = { count: 0, resetAtMs: now_ms + options.windowMs };
      bucket_map.set(key, entry);
    } else entry = existing;

    if (entry.count >= options.limit) {
      if (include_headers) {
        res.setHeader(
          "Retry-After",
          String(Math.ceil((entry.resetAtMs - now_ms) / 1000)),
        );
        res.setHeader("X-RateLimit-Limit", String(options.limit));
        res.setHeader("X-RateLimit-Remaining", "0");
      }
      res.setStatus(status_code).json({ error: message });
      return;
    }

    entry.count++;
    if (include_headers)
      res.setHeader(
        "X-RateLimit-Remaining",
        String(options.limit - entry.count),
      );

    await next();
  };
}
