import type {
  MiddlewareFn,
  RedisSessionClient,
  RedisSessionStoreOptions,
  SessionEntry,
  SessionOptions,
  SessionStore,
} from "../types";
import type { OxarionRequest } from "../adapter/http/request";
import { RedisClient } from "bun";

function create_session_id(): string {
  return crypto.randomUUID();
}

function read_session_id(
  req: OxarionRequest<any>,
  cookie_name: string,
): string | null {
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

export function createMemorySessionStore(
  ttl_ms = 7 * 24 * 60 * 60 * 1000,
): SessionStore {
  const store: Map<string, SessionEntry> = new Map();
  let last_cleanup_ms = Date.now();
  const cleanup_interval_ms = Math.max(ttl_ms, 30_000);

  return {
    get(session_id) {
      return store.get(session_id) ?? null;
    },
    set(session_id, entry) {
      store.set(session_id, entry);
    },
    delete(session_id) {
      store.delete(session_id);
    },
    cleanup(now_ms) {
      if (now_ms - last_cleanup_ms < cleanup_interval_ms) return;
      last_cleanup_ms = now_ms;
      for (const [k, v] of store) if (v.expiresAtMs <= now_ms) store.delete(k);
    },
  };
}

export function createRedisSessionStore(
  options: RedisSessionStoreOptions = {},
): SessionStore & { close: () => void } {
  const client: RedisSessionClient =
    options.client ?? new RedisClient(options.url);
  const prefix = options.prefix ?? "oxarion:sess:";

  const key_of = (session_id: string) => `${prefix}${session_id}`;

  return {
    async get(session_id) {
      const raw = await client.get(key_of(session_id));
      if (!raw) return null;

      try {
        const parsed = JSON.parse(raw) as SessionEntry;
        if (
          !parsed ||
          typeof parsed !== "object" ||
          typeof parsed.expiresAtMs !== "number" ||
          !parsed.data ||
          typeof parsed.data !== "object"
        ) {
          await client.del(key_of(session_id));
          return null;
        }
        return parsed;
      } catch {
        await client.del(key_of(session_id));
        return null;
      }
    },
    async set(session_id, entry) {
      const key = key_of(session_id);
      await client.set(key, JSON.stringify(entry));

      const ttl_seconds = Math.max(
        1,
        Math.ceil((entry.expiresAtMs - Date.now()) / 1000),
      );
      await client.expire(key, ttl_seconds);
    },
    async delete(session_id) {
      await client.del(key_of(session_id));
    },
    close() {
      client.close?.();
    },
  };
}

export function session_middleware(options: SessionOptions = {}): MiddlewareFn {
  const cookie_name = options.cookieName ?? "oxarion_session";
  const ttl_ms = options.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
  const path = options.path ?? "/";
  const same_site = options.sameSite ?? "lax";
  const secure = options.secure ?? false;
  const http_only = options.httpOnly ?? true;
  const rolling = options.rolling ?? true;
  const create_id = options.createId ?? create_session_id;

  if (!Number.isFinite(ttl_ms) || ttl_ms <= 0)
    throw new TypeError("[Oxarion] session: ttlMs must be a positive number");

  const store = options.store ?? createMemorySessionStore(ttl_ms);

  return async (req, res, next) => {
    const now_ms = Date.now();
    if (store.cleanup) await store.cleanup(now_ms);

    let session_id = read_session_id(req, cookie_name);
    let entry =
      session_id !== null ? ((await store.get(session_id)) ?? null) : null;
    let session_created = false;

    if (entry && entry.expiresAtMs <= now_ms) {
      if (store.delete) await store.delete(session_id!);
      entry = null;
    }

    if (!entry) {
      session_id = create_id();
      entry = { data: Object.create(null), expiresAtMs: now_ms + ttl_ms };
      await store.set(session_id, entry);
      session_created = true;
    }

    req.__oxarion_set_session_state(
      session_id,
      entry.data as Record<string, unknown>,
    );

    await next();

    const should_update_cookie =
      session_created || rolling || req.isSessionModified();
    if (!should_update_cookie || session_id === null) return;

    entry.expiresAtMs = Date.now() + ttl_ms;
    await store.set(session_id, entry);

    res.setCookie(cookie_name, session_id, {
      path,
      secure,
      httpOnly: http_only,
      sameSite: same_site,
      maxAgeSeconds: Math.ceil(ttl_ms / 1000),
    });
  };
}
