import { afterEach, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Middleware, Oxarion } from "../../src";

const exec_file = promisify(execFile);
const started_apps: Array<{ stop: () => Promise<void> }> = [];
let redis_container_started = false;
const redis_container_name = `oxarion-redis-test-${process.pid}`;
const redis_port = 6389;
const redis_url = `redis://127.0.0.1:${redis_port}`;

afterEach(async () => {
  while (started_apps.length) await started_apps.pop()!.stop();
  await Oxarion.stop();
});

async function ensure_redis_container() {
  if (redis_container_started) return;

  await exec_file("docker", [
    "run",
    "-d",
    "--rm",
    "--name",
    redis_container_name,
    "-p",
    `${redis_port}:6379`,
    "redis:7-alpine",
  ]);

  let i = 0;
  while (i < 50) {
    try {
      const { stdout } = await exec_file("docker", [
        "exec",
        redis_container_name,
        "redis-cli",
        "ping",
      ]);
      if (stdout.trim() === "PONG") {
        redis_container_started = true;
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
    i++;
  }

  try {
    await exec_file("docker", ["rm", "-f", redis_container_name]);
  } catch {}

  throw new Error("Redis test container did not become ready");
}

async function cleanup_redis_container() {
  if (!redis_container_started) return;
  try {
    await exec_file("docker", ["rm", "-f", redis_container_name]);
  } catch {}
  redis_container_started = false;
}

process.on("exit", () => {
  if (!redis_container_started) return;
  Bun.spawn(["docker", "rm", "-f", redis_container_name], {
    stdout: "ignore",
    stderr: "ignore",
  });
});

const redis_test =
  process.env.OX_ENABLE_REDIS_INTEGRATION === "1" ? test : test.skip;

redis_test(
  "Middleware.createRedisSessionStore should persist session state across app instances",
  { timeout: 30_000 },
  async () => {
    await ensure_redis_container();
    try {
      const make_app = () =>
        Oxarion.create({
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
                  store: Middleware.createRedisSessionStore({
                    url: redis_url,
                    prefix: "oxarion:test:",
                  }),
                }),
              ],
              true,
            );
          },
        });

      const first_app = make_app();
      started_apps.push(first_app);

      const first = await first_app.request("/count");
      expect(await first.text()).toBe("1");
      const jar = (
        (
          first.headers as Headers & { getSetCookie?: () => string[] }
        ).getSetCookie?.() ?? [first.headers.get("set-cookie") || ""]
      )
        .map((line) => line.split(";", 1)[0])
        .join("; ");

      await first_app.stop();
      started_apps.pop();

      const second_app = make_app();
      started_apps.push(second_app);

      const second = await second_app.request({
        method: "GET",
        path: "/count",
        headers: { cookie: jar },
      });
      expect(await second.text()).toBe("2");
    } finally {
      await cleanup_redis_container();
    }
  },
);
