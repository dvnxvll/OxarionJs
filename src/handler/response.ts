import { readFile } from "fs/promises";
import { resolve, sep } from "path";
import type { PageCompression } from "../types";

const page_cache = new Map<string, string>();

export class OxarionResponse {
  private _status = 200;
  private _headers = new Headers();
  private _body: BodyInit | null = null;

  constructor(
    private readonly pages_dir_name: string,
    private readonly cache_pages: boolean,
    private readonly _req: Request,
  ) {}

  static json(obj: unknown, init: ResponseInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify(obj), { ...init, headers });
  }

  static text(body: string, init: ResponseInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "text/plain; charset=utf-8");
    return new Response(body, { ...init, headers });
  }

  static html(body: string, init: ResponseInit = {}) {
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

    this._headers.set(key, value);
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
      if (typeof k !== "string" || typeof v !== "string") {
        throw new TypeError(
          "[Oxarion] setHeaders: all keys and values must be strings",
        );
      }
      this._headers.set(k, v);
    }
    return this;
  }

  /**
   * Sets the response body.
   * @param body - The body to send.
   * @returns The current OxarionResponse instance.
   */
  send(body: BodyInit) {
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

    this._body = body;
    return this;
  }

  /**
   * Sends a JSON response.
   * @param obj - The object to serialize as JSON.
   * @returns The current OxarionResponse instance.
   */
  json(obj: unknown) {
    this._headers.set("Content-Type", "application/json");
    this._body = JSON.stringify(obj);
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
    this._headers.set("Location", url);
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
    return this._headers;
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
    const page_path = filePath.endsWith(".html") ? filePath : filePath + ".html";
    const full_path = resolve(pages_root, page_path);
    const inside_pages_root =
      full_path === pages_root || full_path.startsWith(pages_root + sep);

    if (!inside_pages_root) {
      this.setStatus(403).send("Forbidden: Page path is outside pages directory.");
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
   * @returns The current OxarionResponse instance.
   */
  async sendFile(path: string, contentType?: string) {
    if (typeof path !== "string")
      throw new TypeError("[Oxarion] sendFile: path must be a string");
    if (contentType !== undefined && typeof contentType !== "string")
      throw new TypeError(
        "[Oxarion] sendFile: contentType must be a string if provided",
      );

    try {
      const project_root = resolve(process.cwd());
      const full_path = resolve(project_root, path);
      const inside_project_root =
        full_path === project_root || full_path.startsWith(project_root + sep);

      if (!inside_project_root) {
        this.setStatus(403).send("Forbidden: File path is outside project directory.");
        return this;
      }

      const data = await readFile(full_path);

      if (contentType) this.setHeader("Content-Type", contentType);

      const body = Uint8Array.from(data);
      this.send(new Blob([body]));
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
      headers: this._headers,
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
