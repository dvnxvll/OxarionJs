import type { MiddlewareFn } from "../types";
import { parse_url_path } from "../utils/parse_url";

export function cors(
  options: {
    origin?: string | string[];
    methods?: string | string[];
    credentials?: boolean;
  } = {}
): MiddlewareFn {
  const origin = Array.isArray(options.origin)
    ? options.origin.join(",")
    : options.origin ?? "*";

  const methods = Array.isArray(options.methods)
    ? options.methods.join(",")
    : options.methods ?? "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS";

  return async (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", methods);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (options.credentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");

      if (origin === "*")
        console.warn(
          "Warning: When using credentials, you should specify exact origins instead of '*'"
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

    let i = 0;
    while (i < raw.length) {
      let key = "";
      let value = "";

      while (i < raw.length && raw[i] !== "=" && raw[i] !== "&")
        key += raw[i++];

      if (i < raw.length && raw[i] === "=") i++;
      while (i < raw.length && raw[i] !== "&") value += raw[i++];

      if (i < raw.length && raw[i] === "&") i++;

      if (key) {
        const decodedKey = decodeURIComponent(key);
        const decodedValue = decodeURIComponent(value);

        if (options.extended && decodedKey.endsWith("[]")) {
          const cleanKey = decodedKey.slice(0, -2);
          if (!body[cleanKey]) {
            body[cleanKey] = [];
          }
          (body[cleanKey] as string[]).push(decodedValue);
        } else {
          body[decodedKey] = decodedValue;
        }
      }
    }

    (req as any).body = body;
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
    } else if (typeof options.limit === "number") {
      to_bytes = options.limit;
    }

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

      (req as any).body = JSON.parse(raw);
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
  } = {}
): MiddlewareFn {
  const writer = typeof options.writer === "function" ? options.writer : console.log;

  return async (req, res, next) => {
    const start = performance.now();

    try {
      await next();
    } finally {
      const end = performance.now();
      writer(
        `${req.method()} ${parse_url_path(req.url())} ${res.getStatus()} (${(
          end - start
        ).toFixed(2)}ms)`
      );
    }
  };
}
