import type { MiddlewareFn, SecurityHeadersOptions } from "../types";

export function securityHeaders(
  options: SecurityHeadersOptions = {},
): MiddlewareFn {
  return async (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", options.xFrameOptions ?? "SAMEORIGIN");
    res.setHeader("X-DNS-Prefetch-Control", "off");

    res.setHeader("Referrer-Policy", options.referrerPolicy ?? "no-referrer");
    res.setHeader("Permissions-Policy", options.permissionsPolicy ?? "none");

    const csp = options.contentSecurityPolicy;
    if (csp) res.setHeader("Content-Security-Policy", csp);

    if (options.hsts && typeof options.hsts === "object") {
      const url = req.url();
      const is_https = url.startsWith("https://");
      if (is_https) {
        const max_age = options.hsts.maxAgeSeconds ?? 31536000;
        const include_sub = options.hsts.includeSubDomains ?? true;
        const preload = options.hsts.preload ?? false;
        let value = `max-age=${max_age}`;
        if (include_sub) value += "; includeSubDomains";
        if (preload) value += "; preload";
        res.setHeader("Strict-Transport-Security", value);
      }
    }

    await next();
  };
}
