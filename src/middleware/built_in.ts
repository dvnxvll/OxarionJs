import type { MiddlewareFn } from "../types";
import { parse_url_path } from "../utils/parse_url";

export { rateLimit } from "./rate_limit";
export { securityHeaders } from "./security_headers";
export { session_middleware as session } from "./session";
export { validateJson, validateUrlencoded } from "./validation";

export function cors(
  options: {
    origin?: string | string[];
    methods?: string | string[];
    credentials?: boolean;
  } = {},
): MiddlewareFn {
  const origin = Array.isArray(options.origin)
    ? options.origin.join(",")
    : (options.origin ?? "*");

  const methods = Array.isArray(options.methods)
    ? options.methods.join(",")
    : (options.methods ?? "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");

  return async (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", methods);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (options.credentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");

      if (origin === "*")
        console.warn(
          "Warning: When using credentials, you should specify exact origins instead of '*'",
        );
    }

    if (req.method() === "OPTIONS") {
      res.setStatus(204);
      return;
    }

    await next();
  };
}

export function urlencoded(options: { extended?: boolean } = {}): MiddlewareFn {
  return async (req, _, next) => {
    const type = req.getHeaders()["content-type"]?.toLowerCase() ?? "";
    if (!type.includes("application/x-www-form-urlencoded")) {
      await next();
      return;
    }

    const raw = await req.text();
    const body: Record<string, string | string[]> = Object.create(null);

    if (!raw) {
      req.__oxarion_set_body(body);
      await next();
      return;
    }

    const pairs = raw.split("&");
    let i = 0;

    while (i < pairs.length) {
      const pair = pairs[i];
      const eq = pair.indexOf("=");
      let key: string;
      let value: string;

      if (eq === -1) {
        key = decodeURIComponent(pair);
        value = "";
      } else {
        key = decodeURIComponent(pair.slice(0, eq));
        value = decodeURIComponent(pair.slice(eq + 1));
      }

      if (key) {
        if (options.extended && key.endsWith("[]")) {
          const cleanKey = key.slice(0, -2);
          if (!Array.isArray(body[cleanKey])) body[cleanKey] = [];
          (body[cleanKey] as string[]).push(value);
        } else body[key] = value;
      }
      i++;
    }

    req.__oxarion_set_body(body);
    await next();
  };
}

export function json(options: { limit?: number | string } = {}): MiddlewareFn {
  return async (req, res, next) => {
    const type = req.getHeaders()["content-type"]?.toLowerCase() ?? "";
    if (!type.includes("application/json")) {
      await next();
      return;
    }

    let to_bytes: number | null = null;
    if (typeof options.limit === "string") {
      const match = options.limit.match(/^(\d+)(mb|kb|gb)?$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        const unit = match[2]?.toLowerCase();
        to_bytes =
          unit === "mb"
            ? num * 1024 * 1024
            : unit === "kb"
              ? num * 1024
              : unit === "gb"
                ? num * 1024 * 1024 * 1024
                : num;
      }
    } else if (typeof options.limit === "number") to_bytes = options.limit;

    try {
      const length = parseInt(req.getHeaders()["content-length"] || "0", 10);
      if (to_bytes !== null && length > to_bytes) {
        res.setStatus(413).json({ error: "Payload too large" });
        return;
      }

      const raw = await req.text();
      if (to_bytes !== null && raw.length > to_bytes) {
        res.setStatus(413).json({ error: "Payload too large" });
        return;
      }

      req.__oxarion_set_body(JSON.parse(raw));
    } catch (e) {
      res.setStatus(400).json({ error: "Invalid JSON" });
      return;
    }

    await next();
  };
}

export function logger(
  options: {
    writer?: (message: string) => void;
  } = {},
): MiddlewareFn {
  const writer =
    typeof options.writer === "function" ? options.writer : console.log;

  return async (req, res, next) => {
    const start = performance.now();

    try {
      await next();
    } finally {
      const end = performance.now();
      writer(
        `${req.method()} ${parse_url_path(req.url())} ${res.getStatus()} (${(
          end - start
        ).toFixed(2)}ms)`,
      );
    }
  };
}
