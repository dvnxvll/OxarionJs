import type { MiddlewareFn, SessionEntry, SessionOptions } from "../types";
import type { OxarionRequest } from "../handler/request";

function create_session_id(): string {
  return crypto.randomUUID();
}

export function session_middleware(options: SessionOptions = {}): MiddlewareFn {
  const cookie_name = options.cookieName ?? "oxarion_session";
  const ttl_ms = options.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
  const path = options.path ?? "/";
  const same_site = options.sameSite ?? "lax";
  const secure = options.secure ?? false;
  const http_only = options.httpOnly ?? true;
  const rolling = options.rolling ?? true;

  if (!Number.isFinite(ttl_ms) || ttl_ms <= 0)
    throw new TypeError("[Oxarion] session: ttlMs must be a positive number");

  const store: Map<string, SessionEntry> = new Map();
  let last_cleanup_ms = Date.now();
  const cleanup_interval_ms = Math.max(ttl_ms, 30_000);

  function cleanup_expired(now_ms: number) {
    if (now_ms - last_cleanup_ms < cleanup_interval_ms) return;
    last_cleanup_ms = now_ms;
    for (const [k, v] of store) if (v.expiresAtMs <= now_ms) store.delete(k);
  }

  function read_session_id(req: OxarionRequest<any>): string | null {
    const cookies = req.getCookies();
    const raw_value = cookies[cookie_name];
    if (!raw_value) return null;

    try {
      const decoded = decodeURIComponent(raw_value);
      return decoded || null;
    } catch {
      return raw_value || null;
    }
  }

  return async (req, res, next) => {
    const now_ms = Date.now();
    cleanup_expired(now_ms);

    let session_id = read_session_id(req);
    let entry: SessionEntry | undefined =
      session_id !== null ? store.get(session_id) : undefined;

    if (!entry || entry.expiresAtMs <= now_ms) {
      session_id = create_session_id();
      entry = { data: Object.create(null), expiresAtMs: now_ms + ttl_ms };
      store.set(session_id, entry);
    }

    req.__oxarion_set_session_state(
      session_id,
      entry.data as Record<string, unknown>,
    );

    await next();

    const should_update_cookie = rolling || req.isSessionModified();
    if (!should_update_cookie) return;

    if (session_id === null) return;
    entry!.expiresAtMs = now_ms + ttl_ms;

    res.setCookie(cookie_name, session_id, {
      path,
      secure,
      httpOnly: http_only,
      sameSite: same_site,
    });
  };
}
