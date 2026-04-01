import { afterEach, expect, test } from "bun:test";
import { Middleware, Oxarion } from "../../../src";
import type { SessionEntry, SessionStore } from "../../../src";

const started_apps: Array<{ stop: () => Promise<void> }> = [];

afterEach(async () => {
  while (started_apps.length) await started_apps.pop()!.stop();
  await Oxarion.stop();
});

const get_set_cookie_lines = (res: Response): string[] => {
  const direct = (
    res.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.();
  if (direct && direct.length) return direct;

  const lines: string[] = [];
  for (const [key, value] of res.headers.entries())
    if (key.toLowerCase() === "set-cookie") lines.push(value);

  if (lines.length) return lines;
  const merged = res.headers.get("set-cookie");
  if (!merged) return [];
  return merged.split(/,(?=[^;,\s]+=)/g);
};

const cookie_jar_from = (res: Response): string =>
  get_set_cookie_lines(res)
    .map((line) => line.split(";", 1)[0])
    .join("; ");

test("Middleware.session should support custom session stores", async () => {
  const entries = new Map<string, SessionEntry>();
  const ops = { cleanup: 0, get: 0, set: 0 };
  const store: SessionStore = {
    cleanup() {
      ops.cleanup++;
    },
    get(session_id) {
      ops.get++;
      return entries.get(session_id) ?? null;
    },
    set(session_id, entry) {
      ops.set++;
      entries.set(session_id, entry);
    },
  };

  const app = Oxarion.create({
    checkLatestVersion: false,
    httpHandler: (router) => {
      router.addHandler("GET", "/count", (req, res) => {
        const count = Number(req.getSessionValue("count") || 0) + 1;
        req.setSessionValue("count", count);
        return res.text(String(count));
      });
    },
    safeMwRegister: (router) => {
      router.multiMiddleware(
        "/",
        [
          Middleware.session({
            cookieName: "sid",
            rolling: false,
            store,
            createId: () => "fixed-session",
          }),
        ],
        true,
      );
    },
  });

  started_apps.push(app);

  const first = await app.request("/count");
  expect(await first.text()).toBe("1");
  expect(cookie_jar_from(first)).toContain("sid=fixed-session");

  const second = await app.request({
    method: "GET",
    path: "/count",
    headers: { cookie: cookie_jar_from(first) },
  });
  expect(await second.text()).toBe("2");
  expect(entries.get("fixed-session")?.data.count).toBe(2);
  expect(ops.cleanup).toBeGreaterThan(0);
  expect(ops.get).toBeGreaterThan(0);
  expect(ops.set).toBeGreaterThan(1);
});

test("Middleware.createRedisSessionStore should persist JSON entries with ttl", async () => {
  const commands: Array<[string, ...Array<string | number>]> = [];
  const redis_data = new Map<string, string>();
  const redis_client = {
    async get(key: string) {
      commands.push(["get", key]);
      return redis_data.get(key) ?? null;
    },
    async set(key: string, value: string) {
      commands.push(["set", key, value]);
      redis_data.set(key, value);
    },
    async del(key: string) {
      commands.push(["del", key]);
      redis_data.delete(key);
    },
    async expire(key: string, ttl_seconds: number) {
      commands.push(["expire", key, ttl_seconds]);
    },
    close() {
      commands.push(["close"]);
    },
  };

  const store = Middleware.createRedisSessionStore({
    client: redis_client,
    prefix: "test:sess:",
  });

  const entry: SessionEntry = {
    data: { count: 3 },
    expiresAtMs: Date.now() + 30_000,
  };

  await store.set("abc", entry);
  const loaded = await store.get("abc");

  expect(loaded).toEqual(entry);
  expect(commands[0]?.[0]).toBe("set");
  expect(commands[1]?.[0]).toBe("expire");
  expect(String(commands[1]?.[1])).toBe("test:sess:abc");
  expect(Number(commands[1]?.[2])).toBeGreaterThan(0);

  redis_data.set("test:sess:bad", "not-json");
  expect(await store.get("bad")).toBeNull();
  expect(
    commands.some((cmd) => cmd[0] === "del" && cmd[1] === "test:sess:bad"),
  ).toBe(true);

  store.close();
  expect(commands.at(-1)?.[0]).toBe("close");
});

test("Middleware.csrf should block invalid mutating requests and accept valid ox tokens", async () => {
  const app = Oxarion.create({
    checkLatestVersion: false,
    httpHandler: (router) => {
      router.addHandler("GET", "/", (req, res) => {
        return res.text(req.getCsrfToken() || "");
      });

      router.addHandler("POST", "/mutate", (req, res) => {
        req.setSessionValue("mutated", true);
        return res.text("ok");
      });
    },
    safeMwRegister: (router) => {
      router.multiMiddleware(
        "/",
        [Middleware.session({ cookieName: "sid" }), Middleware.csrf()],
        true,
      );
    },
  });

  started_apps.push(app);

  const first = await app.request("/");
  const token = await first.text();
  const jar = cookie_jar_from(first);

  expect(token.length).toBeGreaterThan(15);
  expect(first.headers.get("x-ox-csrf")).toBe(token);
  expect(jar).toContain("sid=");
  expect(jar).toContain("oxarion_csrf=");

  const missing = await app.request({
    method: "POST",
    path: "/mutate",
    headers: { cookie: jar },
  });
  expect(missing.status).toBe(403);

  const wrong = await app.request({
    method: "POST",
    path: "/mutate",
    headers: {
      cookie: jar,
      "x-ox-csrf": "wrong-token",
    },
  });
  expect(wrong.status).toBe(403);

  const valid = await app.request({
    method: "POST",
    path: "/mutate",
    headers: {
      cookie: jar,
      "x-ox-csrf": token,
    },
  });
  expect(valid.status).toBe(200);
  expect(await valid.text()).toBe("ok");
});

test("Middleware.csrf should accept x-csrf-token and form field tokens", async () => {
  const app = Oxarion.create({
    checkLatestVersion: false,
    httpHandler: (router) => {
      router.addHandler("GET", "/", (req, res) => {
        return res.text(req.getCsrfToken() || "");
      });

      router.addHandler("POST", "/form", (req, res) => {
        return res.text("ok");
      });
    },
    safeMwRegister: (router) => {
      router.multiMiddleware(
        "/",
        [
          Middleware.session({ cookieName: "sid" }),
          Middleware.urlencoded(),
          Middleware.csrf(),
        ],
        true,
      );
    },
  });

  started_apps.push(app);

  const first = await app.request("/");
  const token = await first.text();
  const jar = cookie_jar_from(first);

  const header_alias = await app.request({
    method: "POST",
    path: "/form",
    headers: {
      cookie: jar,
      "content-type": "application/x-www-form-urlencoded",
      "x-csrf-token": token,
    },
    body: "name=oxarion",
  });
  expect(header_alias.status).toBe(200);

  const form_field = await app.request({
    method: "POST",
    path: "/form",
    headers: {
      cookie: jar,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: `_csrf=${token}&name=oxarion`,
  });
  expect(form_field.status).toBe(200);
});

test("Middleware.csrf should fail fast when session middleware is missing", async () => {
  const app = Oxarion.create({
    checkLatestVersion: false,
    httpHandler: (router) => {
      router.addHandler("GET", "/", (_req, res) => {
        return res.text("ok");
      });
    },
    errorHandler: (_error, _req, res) => {
      return res.text("error", { status: 500 });
    },
    safeMwRegister: (router) => {
      router.multiMiddleware("/", [Middleware.csrf()], true);
    },
  });

  started_apps.push(app);

  const res = await app.request("/");
  expect(res.status).toBe(500);
});

test("router.serveOx should return the hashed runtime path and keep a stable alias", async () => {
  let runtime_path = "";

  const app = Oxarion.create({
    checkLatestVersion: false,
    httpHandler: (router) => {
      runtime_path = router.serveOx();
    },
  });

  started_apps.push(app);

  await app.request("/__oxarion/ox.js");
  expect(runtime_path).toMatch(/^\/__oxarion\/ox\.[a-f0-9]{12}\.js$/);

  const alias = await app.request("/__oxarion/ox.js");
  const hashed = await app.request(runtime_path);
  const alias_body = await alias.text();
  const hashed_body = await hashed.text();

  expect(alias.status).toBe(200);
  expect(hashed.status).toBe(200);
  expect(alias.headers.get("cache-control")).toBe(
    "no-cache, max-age=0, must-revalidate",
  );
  expect(hashed.headers.get("cache-control")).toBe(
    "public, max-age=31536000, immutable",
  );
  expect(alias_body).toBe(hashed_body);
  expect(alias_body).toContain("x-ox-csrf");
  expect(alias_body).toContain("getCsrfToken");
});
