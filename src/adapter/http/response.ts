import { readFile, stat } from "fs/promises";
import { resolve, sep } from "path";
import type {
  PageCompression,
  RenderData,
  RenderOptions,
  SendFileOptions,
  SseHandler,
  StreamHandler,
} from "../../types";
import type { TemplateEngine } from "./template";

const page_cache = new Map<string, string>();
const json_content_type = { "Content-Type": "application/json" };
const text_content_type = { "Content-Type": "text/plain; charset=utf-8" };
const html_content_type = { "Content-Type": "text/html; charset=utf-8" };
const text_encoder = new TextEncoder();

export class OxarionResponse {
  private _status = 200;
  private _status_text: string | undefined = undefined;
  private _headers: Headers | null = null;
  private _body: BodyInit | null = null;

  constructor(
    private readonly pages_dir_name: string,
    private readonly cache_pages: boolean,
    private readonly _req: Request,
    private readonly template_engine: TemplateEngine | null = null,
  ) {}

  private ensure_headers(): Headers {
    if (this._headers) return this._headers;
    this._headers = new Headers();
    return this._headers;
  }

  private apply_init(init?: ResponseInit) {
    if (!init) return this;
    if (init.status !== undefined) this.setStatus(init.status);
    if (init.statusText !== undefined) {
      if (typeof init.statusText !== "string")
        throw new TypeError(
          "[Oxarion] response init: statusText must be a string",
        );
      this._status_text = init.statusText;
    }
    if (init.headers !== undefined) {
      const headers = new Headers(init.headers);
      headers.forEach((value, key) => {
        this.ensure_headers().set(key, value);
      });
    }
    return this;
  }

  setCookie(
    name: string,
    value: string,
    options: {
      path?: string;
      domain?: string;
      maxAgeSeconds?: number;
      expires?: Date;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "lax" | "strict" | "none";
    } = {},
  ) {
    if (typeof name !== "string" || !name)
      throw new TypeError(
        "[Oxarion] setCookie: name must be a non-empty string",
      );
    if (typeof value !== "string")
      throw new TypeError("[Oxarion] setCookie: value must be a string");

    let cookie = `${name}=${encodeURIComponent(value)}`;

    if (options.path) cookie += `; Path=${options.path}`;
    if (options.domain) cookie += `; Domain=${options.domain}`;
    if (options.maxAgeSeconds !== undefined) {
      if (
        typeof options.maxAgeSeconds !== "number" ||
        !Number.isFinite(options.maxAgeSeconds) ||
        !Number.isInteger(options.maxAgeSeconds)
      ) {
        throw new TypeError(
          "[Oxarion] setCookie: maxAgeSeconds must be an integer number",
        );
      }
      cookie += `; Max-Age=${options.maxAgeSeconds}`;
    }
    if (options.expires) cookie += `; Expires=${options.expires.toUTCString()}`;
    if (options.httpOnly) cookie += "; HttpOnly";
    if (options.secure) cookie += "; Secure";
    if (options.sameSite)
      cookie += `; SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`;

    this.ensure_headers().append("Set-Cookie", cookie);
    return this;
  }

  clearCookie(
    name: string,
    options: {
      path?: string;
      domain?: string;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: "lax" | "strict" | "none";
    } = {},
  ) {
    return this.setCookie(name, "", {
      ...options,
      maxAgeSeconds: 0,
      expires: new Date(0),
    });
  }

  static json(obj: unknown, init: ResponseInit = {}) {
    if (init.headers === undefined)
      return new Response(JSON.stringify(obj), {
        status: init.status,
        statusText: init.statusText,
        headers: json_content_type,
      });

    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(obj), { ...init, headers });
  }

  static text(body: string, init: ResponseInit = {}) {
    if (init.headers === undefined)
      return new Response(body, {
        status: init.status,
        statusText: init.statusText,
        headers: text_content_type,
      });

    const headers = new Headers(init.headers);
    headers.set("Content-Type", "text/plain; charset=utf-8");
    return new Response(body, { ...init, headers });
  }

  static html(body: string, init: ResponseInit = {}) {
    if (init.headers === undefined)
      return new Response(body, {
        status: init.status,
        statusText: init.statusText,
        headers: html_content_type,
      });

    const headers = new Headers(init.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(body, { ...init, headers });
  }

  static redirect(url: string, status = 302) {
    if (typeof url !== "string")
      throw new TypeError("[Oxarion] redirect: url must be a string");
    if (
      typeof status !== "number" ||
      !Number.isInteger(status) ||
      status < 300 ||
      status > 399
    )
      throw new TypeError(
        "[Oxarion] redirect: status must be an integer between 300 and 399",
      );

    return new Response(null, {
      status,
      headers: { Location: url },
    });
  }

  /**
   * Sets the HTTP status code for the response.
   * @param code - The status code to set.
   * @returns The current OxarionResponse instance.
   */
  setStatus(code: number) {
    if (
      typeof code !== "number" ||
      !Number.isInteger(code) ||
      code < 100 ||
      code > 599
    )
      throw new TypeError(
        "[Oxarion] setStatus: code must be an integer between 100 and 599",
      );

    this._status = code;
    return this;
  }

  /**
   * Sets a single header on the response.
   * @param key - The header name.
   * @param value - The header value.
   * @returns The current OxarionResponse instance.
   */
  setHeader(key: string, value: string) {
    if (typeof key !== "string" || typeof value !== "string")
      throw new TypeError("[Oxarion] setHeader: key and value must be strings");

    this.ensure_headers().set(key, value);
    return this;
  }

  /**
   * Sets multiple headers on the response.
   * @param headers - An object containing header key-value pairs.
   * @returns The current OxarionResponse instance.
   */
  setHeaders(headers: Record<string, string>) {
    if (
      typeof headers !== "object" ||
      headers === null ||
      Array.isArray(headers)
    )
      throw new TypeError(
        "[Oxarion] setHeaders: headers must be a plain object",
      );

    const entries = Object.entries(headers);
    let i = entries.length;
    while (i--) {
      const [k, v] = entries[i];
      if (typeof k !== "string" || typeof v !== "string")
        throw new TypeError(
          "[Oxarion] setHeaders: all keys and values must be strings",
        );

      this.ensure_headers().set(k, v);
    }
    return this;
  }

  /**
   * Sets the response body.
   * @param body - The body to send.
   * @returns The current OxarionResponse instance.
   */
  send(body: BodyInit, init?: ResponseInit) {
    if (
      typeof body !== "string" &&
      !(body instanceof ArrayBuffer) &&
      !(body instanceof Uint8Array) &&
      !(typeof Blob !== "undefined" && body instanceof Blob) &&
      !(typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
    )
      throw new TypeError(
        "[Oxarion] send: body must be a string, ArrayBuffer, Uint8Array, Blob, or ReadableStream",
      );

    this.apply_init(init);
    this._body = body;
    return this;
  }

  /**
   * Sends a JSON response.
   * @param obj - The object to serialize as JSON.
   * @returns The current OxarionResponse instance.
   */
  json(obj: unknown, init?: ResponseInit) {
    this.apply_init(init);
    this.ensure_headers().set("Content-Type", "application/json");
    this._body = JSON.stringify(obj);
    return this;
  }

  text(body: string, init?: ResponseInit) {
    if (typeof body !== "string")
      throw new TypeError("[Oxarion] text: body must be a string");

    this.apply_init(init);
    this.ensure_headers().set("Content-Type", "text/plain; charset=utf-8");
    this._body = body;
    return this;
  }

  html(body: string, init?: ResponseInit) {
    if (typeof body !== "string")
      throw new TypeError("[Oxarion] html: body must be a string");

    this.apply_init(init);
    this.ensure_headers().set("Content-Type", "text/html; charset=utf-8");
    this._body = body;
    return this;
  }

  async render(
    page: string,
    data: RenderData = {},
    options: RenderOptions = {},
  ) {
    if (!this.template_engine)
      throw new Error(
        "[Oxarion] render: template rendering is disabled. Enable it with the template option.",
      );

    const html = await this.template_engine.render_page(page, data);
    return this.html(html, options);
  }

  async renderFragment(
    fragment: string,
    data: RenderData = {},
    options: RenderOptions = {},
  ) {
    if (!this.template_engine)
      throw new Error(
        "[Oxarion] renderFragment: template rendering is disabled. Enable it with the template option.",
      );

    const html = await this.template_engine.render_fragment(fragment, data);
    return this.html(html, options);
  }

  stream(handler: StreamHandler, init?: ResponseInit) {
    if (typeof handler !== "function")
      throw new TypeError("[Oxarion] stream: handler must be a function");

    this.apply_init(init);
    this._body = new ReadableStream({
      async start(controller) {
        let closed = false;
        const writer = {
          write: async (chunk: string | Uint8Array) => {
            if (closed) return;
            controller.enqueue(
              typeof chunk === "string" ? text_encoder.encode(chunk) : chunk,
            );
          },
          close: async () => {
            if (closed) return;
            closed = true;
            controller.close();
          },
        };

        try {
          await handler(writer);
          if (!closed) {
            closed = true;
            controller.close();
          }
        } catch (err) {
          controller.error(err);
        }
      },
    });
    return this;
  }

  sse(handler: SseHandler, init?: ResponseInit) {
    if (typeof handler !== "function")
      throw new TypeError("[Oxarion] sse: handler must be a function");

    this.apply_init(init);
    this.ensure_headers().set("Content-Type", "text/event-stream");
    this.ensure_headers().set("Cache-Control", "no-cache");
    this.ensure_headers().set("Connection", "keep-alive");

    this._body = new ReadableStream({
      async start(controller) {
        let closed = false;
        const write_line = async (line: string) => {
          if (closed) return;
          controller.enqueue(text_encoder.encode(line));
        };

        const sse = {
          send: async (event: string, data: unknown, id?: string) => {
            let payload = "";
            if (id !== undefined) payload += `id: ${id}\n`;
            if (event) payload += `event: ${event}\n`;
            const text =
              typeof data === "string" ? data : JSON.stringify(data ?? null);
            const lines = text.split("\n");
            let i = 0;
            while (i < lines.length) payload += `data: ${lines[i++]}\n`;
            payload += "\n";
            await write_line(payload);
          },
          comment: async (text: string) => {
            await write_line(`: ${text}\n\n`);
          },
          close: async () => {
            if (closed) return;
            closed = true;
            controller.close();
          },
        };

        try {
          await handler(sse);
          if (!closed) {
            closed = true;
            controller.close();
          }
        } catch (err) {
          controller.error(err);
        }
      },
    });
    return this;
  }

  /**
   * Redirects to a given URL with an optional status code.
   * @param url - The URL to redirect to.
   * @param status - The HTTP status code (default: 302).
   * @returns The current OxarionResponse instance.
   */
  redirect(url: string, status = 302) {
    if (typeof url !== "string")
      throw new TypeError("[Oxarion] redirect: url must be a string");
    if (
      typeof status !== "number" ||
      !Number.isInteger(status) ||
      status < 300 ||
      status > 399
    )
      throw new TypeError(
        "[Oxarion] redirect: status must be an integer between 300 and 399",
      );

    this._status = status;
    this.ensure_headers().set("Location", url);
    return this;
  }

  /**
   * Gets the response body.
   * @returns The response body.
   */
  getBody() {
    return this._body;
  }

  /**
   * Gets the response headers.
   * @returns The response headers as a Headers object.
   */
  getHeaders() {
    return this.ensure_headers();
  }

  /**
   * Gets the HTTP status code.
   * @returns The status code.
   */
  getStatus() {
    return this._status;
  }

  /**
   * Sends an HTML page, optionally with compression.
   * @param filePath - The path to the HTML file (relative to pages_dir_name).
   * @param compression - Optional compression options.
   * @returns A PageSendController or undefined if the page is not found.
   */
  async sendPage(
    filePath: string,
    compression?: PageCompression,
  ): Promise<PageSendController | undefined> {
    if (typeof filePath !== "string")
      throw new TypeError("[Oxarion] sendPage: filePath must be a string");
    if (
      compression !== undefined &&
      (typeof compression !== "object" || compression === null)
    )
      throw new TypeError(
        "[Oxarion] sendPage: compression must be an object if provided",
      );

    const pages_root = resolve(process.cwd(), this.pages_dir_name);
    const page_path = filePath.endsWith(".html")
      ? filePath
      : filePath + ".html";
    const full_path = resolve(pages_root, page_path);
    const inside_pages_root =
      full_path === pages_root || full_path.startsWith(pages_root + sep);

    if (!inside_pages_root) {
      this.setStatus(403).send(
        "Forbidden: Page path is outside pages directory.",
      );
      return;
    }

    let html = page_cache.get(full_path);

    if (html === undefined)
      try {
        html = await readFile(full_path, "utf8");
        if (this.cache_pages) page_cache.set(full_path, html);
      } catch {
        this.setStatus(404).send(
          "Page Mismatch: The requested page does not match any available pages.",
        );
        return;
      }

    if (!compression)
      return new PageSendController(
        this.setHeader("Content-Type", "text/html").send(html),
        full_path,
        html,
      );

    const acc_encoding = this._req?.headers.get("accept-encoding") || "";
    const use_gzip =
      compression.type === "gzip" && acc_encoding.includes("gzip");
    const use_zstd =
      compression.type === "zstd" && acc_encoding.includes("zstd");

    if (use_gzip) {
      const { type, ...opts } = compression;
      const press = Buffer.from(Bun.gzipSync(Buffer.from(html), opts));

      return new PageSendController(
        this.setHeaders({
          "Content-Type": "text/html",
          "Content-Encoding": "gzip",
          Vary: "Accept-Encoding",
        }).send(press),
        full_path,
        html,
      );
    } else if (use_zstd) {
      const { type, ...opts } = compression;
      const press = Buffer.from(Bun.zstdCompressSync(Buffer.from(html), opts));

      return new PageSendController(
        this.setHeaders({
          "Content-Type": "text/html",
          "Content-Encoding": "zstd",
          Vary: "Accept-Encoding",
        }).send(press),
        full_path,
        html,
      );
    }

    return new PageSendController(
      this.setHeader("Content-Type", "text/html").send(html),
      full_path,
      html,
    );
  }

  /**
   * Sends a file as the response body.
   * @param path - The file path (relative to cwd).
   * @param contentType - Optional content type header.
   * @param options - Optional caching options for production use.
   * @returns The current OxarionResponse instance.
   */
  async sendFile(
    path: string,
    contentType?: string,
    options: SendFileOptions = {},
  ) {
    if (typeof path !== "string")
      throw new TypeError("[Oxarion] sendFile: path must be a string");
    if (contentType !== undefined && typeof contentType !== "string")
      throw new TypeError(
        "[Oxarion] sendFile: contentType must be a string if provided",
      );
    if (typeof options !== "object" || options === null)
      throw new TypeError("[Oxarion] sendFile: options must be an object");

    try {
      const project_root = resolve(process.cwd());
      const full_path = resolve(project_root, path);
      const inside_project_root =
        full_path === project_root || full_path.startsWith(project_root + sep);

      if (!inside_project_root) {
        this.setStatus(403).send(
          "Forbidden: File path is outside project directory.",
        );
        return this;
      }

      const use_etag = options.etag === true;
      const use_last_modified = options.lastModified === true;
      if (contentType) this.ensure_headers().set("Content-Type", contentType);

      if (options.cacheControl) {
        if (typeof options.cacheControl !== "string")
          throw new TypeError(
            "[Oxarion] sendFile: cacheControl must be a string if provided",
          );

        this.ensure_headers().set("Cache-Control", options.cacheControl);
      } else if (options.maxAgeSeconds !== undefined) {
        if (
          typeof options.maxAgeSeconds !== "number" ||
          !Number.isFinite(options.maxAgeSeconds) ||
          !Number.isInteger(options.maxAgeSeconds) ||
          options.maxAgeSeconds < 0
        )
          throw new TypeError(
            "[Oxarion] sendFile: maxAgeSeconds must be a non-negative integer",
          );

        this.ensure_headers().set(
          "Cache-Control",
          `public, max-age=${options.maxAgeSeconds}, must-revalidate`,
        );
      }

      if (!use_etag && !use_last_modified) {
        this._body = Bun.file(full_path) as any;
        return this;
      }

      const file_stat = await stat(full_path);
      const etag = use_etag
        ? `W/"${file_stat.size}-${Math.floor(file_stat.mtimeMs)}"`
        : undefined;
      const last_modified = use_last_modified
        ? new Date(file_stat.mtimeMs).toUTCString()
        : undefined;

      if (etag) this.ensure_headers().set("ETag", etag);
      if (last_modified)
        this.ensure_headers().set("Last-Modified", last_modified);
      this.ensure_headers().set("Accept-Ranges", "bytes");
      this.ensure_headers().set("Content-Length", String(file_stat.size));

      const if_none_match = this._req.headers.get("if-none-match");
      if (use_etag && if_none_match && etag) {
        const parts = if_none_match.split(",");
        let i = 0;
        let hit = false;
        while (i < parts.length) {
          const token = parts[i++].trim();
          if (token === "*" || token === etag) {
            hit = true;
            break;
          }
        }
        if (hit) {
          this.setStatus(304);
          this._body = null;
          return this;
        }
      }

      const if_modified_since = this._req.headers.get("if-modified-since");
      if (use_last_modified && if_modified_since && last_modified) {
        const since_ms = Date.parse(if_modified_since);
        if (!Number.isNaN(since_ms)) {
          if (file_stat.mtimeMs <= since_ms) {
            this.setStatus(304);
            this._body = null;
            return this;
          }
        }
      }

      this._body = Bun.file(full_path) as any;
    } catch {
      this.setStatus(404).send(
        "File Mismatch: The requested file does not match any available files.",
      );
    }
    return this;
  }

  /**
   * Converts the OxarionResponse to a native Response object.
   * @returns A Response instance.
   */
  toResponse(): Response {
    return new Response(this._body, {
      status: this._status,
      statusText: this._status_text,
      headers: this._headers || undefined,
    });
  }
}

/**
 * Controller for managing static page caching.
 */
class PageSendController {
  constructor(
    private readonly res: OxarionResponse,
    private readonly path: string,
    private readonly html: string | null,
  ) {}

  /**
   * Enables static caching for the page.
   * @returns The OxarionResponse instance.
   */
  setStatic() {
    if (this.html !== null) page_cache.set(this.path, this.html);
    return this.res;
  }

  /**
   * Disables static caching for the page.
   * @returns The OxarionResponse instance.
   */
  disableStatic() {
    page_cache.delete(this.path);
    return this.res;
  }
}
