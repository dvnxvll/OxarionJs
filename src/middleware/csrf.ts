import { ParsedFormData } from "../form_data";
import type { CsrfOptions, MiddlewareFn } from "../types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function create_csrf_token(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function read_body_token(
  body: unknown,
  field_name: string,
): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  if (body instanceof ParsedFormData) return body.getField(field_name);

  const value = (body as Record<string, unknown>)[field_name];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export function csrf(options: CsrfOptions = {}): MiddlewareFn {
  const session_key = options.sessionKey ?? "__oxarion_csrf";
  const cookie_name = options.cookieName ?? "oxarion_csrf";
  const field_name = options.fieldName ?? "_csrf";
  const path = options.path ?? "/";
  const same_site = options.sameSite ?? "lax";
  const secure = options.secure ?? false;

  return async (req, res, next) => {
    if (!req.getSessionId())
      throw new Error(
        "[Oxarion] csrf: session middleware must run before csrf middleware",
      );

    let token = req.getSessionValue<string>(session_key);
    if (!token) {
      token = create_csrf_token();
      req.setSessionValue(session_key, token);
    }

    req.__oxarion_set_csrf_token(token);
    res.setHeader("x-ox-csrf", token);
    res.setCookie(cookie_name, token, {
      path,
      secure,
      httpOnly: false,
      sameSite: same_site,
    });

    if (SAFE_METHODS.has(req.method().toUpperCase())) {
      await next();
      return;
    }

    const header_token =
      req.raw.headers.get("x-ox-csrf") || req.raw.headers.get("x-csrf-token");
    const body_token = read_body_token(req.getBody(), field_name);

    if (header_token !== token && body_token !== token) {
      res.setStatus(403).json({ error: "Invalid CSRF token" });
      return;
    }

    await next();
  };
}
