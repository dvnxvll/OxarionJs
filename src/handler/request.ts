import { ParsedFormData } from "../form_data";

export class OxarionRequest<TParams extends Record<string, any>> {
  constructor(
    public readonly raw: Request,
    private readonly params: TParams,
  ) {}

  private _cookies_cache: Record<string, string> | null = null;

  private _body: unknown | null = null;
  private _body_is_set = false;

  private _session_id: string | null = null;
  private _session_data: Record<string, unknown> | null = null;
  private _session_modified = false;

  private parse_cookies(): Record<string, string> {
    const cookie_header = this.raw.headers.get("cookie");
    if (!cookie_header) return {};

    const result: Record<string, string> = Object.create(null);

    let i = 0;
    const len = cookie_header.length;

    while (i < len) {
      while (
        i < len &&
        (cookie_header.charCodeAt(i) === 32 || cookie_header[i] === ";")
      )
        i++;

      if (i >= len) break;

      let name_end = i;
      while (name_end < len) {
        const c = cookie_header[name_end];
        if (c === "=" || c === ";") break;
        name_end++;
      }

      if (name_end >= len || cookie_header[name_end] !== "=") {
        while (i < len && cookie_header[i] !== ";") i++;
        continue;
      }

      const name = cookie_header.slice(i, name_end).trim();
      i = name_end + 1;

      let value_end = i;
      while (value_end < len && cookie_header[value_end] !== ";") value_end++;

      const raw_value = cookie_header.slice(i, value_end).trim();
      if (name) result[name] = raw_value;

      i = value_end + 1;
    }

    return result;
  }

  /**
   * Returns all cookies as a key-value object.
   */
  getCookies(): Record<string, string> {
    if (this._cookies_cache) return this._cookies_cache;
    this._cookies_cache = this.parse_cookies();
    return this._cookies_cache;
  }

  /**
   * Returns a single cookie value by name.
   */
  getCookie(name: string): string | undefined {
    return this.getCookies()[name];
  }

  /**
   * Gets current session id (if session middleware is enabled).
   */
  getSessionId(): string | undefined {
    return this._session_id ?? undefined;
  }

  /**
   * Gets the session data object (mutate through setSessionValue for tracking).
   */
  getSession<T extends Record<string, unknown> = Record<string, unknown>>(): T {
    return (this._session_data ||
      (Object.create(null) as Record<string, unknown>)) as T;
  }

  /**
   * Returns a single session value by key.
   */
  getSessionValue<T = unknown>(key: string): T | undefined {
    return (this._session_data as Record<string, unknown> | null)?.[key] as
      | T
      | undefined;
  }

  /**
   * Sets a session value and marks the session as modified.
   */
  setSessionValue(key: string, value: unknown) {
    if (!this._session_data) {
      this._session_data = Object.create(null);
    }
    (this._session_data as Record<string, unknown>)[key] = value;
    this._session_modified = true;
  }

  /**
   * Deletes a session value and marks the session as modified.
   */
  deleteSessionValue(key: string) {
    if (!this._session_data) return;
    delete this._session_data[key];
    this._session_modified = true;
  }

  /**
   * Returns whether session data has been modified during the request.
   */
  isSessionModified(): boolean {
    return this._session_modified;
  }

  __oxarion_set_session_state(
    session_id: string | null,
    session_data: Record<string, unknown>,
  ) {
    this._session_id = session_id;
    this._session_data = session_data;
    this._session_modified = false;
  }

  /**
   * Sets an already-parsed request body (JSON, urlencoded, validated, etc).
   * Internal API for middleware to avoid double parsing.
   */
  __oxarion_set_body(body: unknown) {
    this._body = body;
    this._body_is_set = true;
  }

  /**
   * Returns whether the request body was set by middleware.
   */
  __oxarion_has_body(): boolean {
    return this._body_is_set;
  }

  /**
   * Returns the parsed/validated body (if set by middleware).
   */
  getBody<T = unknown>(): T | undefined {
    if (!this._body_is_set) return undefined;
    return this._body as T;
  }

  /**
   * Returns the value of a route parameter by key.
   * @param key - The parameter name.
   */
  getParam<K extends keyof TParams>(key: K): TParams[K] {
    return this.params[key];
  }

  /**
   * Returns the full request URL as a string.
   */
  url(): string {
    return this.raw.url;
  }

  /**
   * Parses the request body as JSON.
   */
  async json<T = unknown>(): Promise<T> {
    return await this.raw.json();
  }

  /**
   * Reads the request body as plain text.
   */
  async text(): Promise<string> {
    return await this.raw.text();
  }

  /**
   * Parses the request body as form data.
   */
  async form(): Promise<ParsedFormData> {
    const data = await this.raw.formData();
    return new ParsedFormData(data);
  }

  /**
   * Returns the HTTP method of the request.
   */
  method() {
    return this.raw.method;
  }

  /**
   * Returns all request headers as a lowercase key-value object.
   */
  getHeaders(): Record<string, string> {
    const result: Record<string, string> = {};
    const entries = Array.from(this.raw.headers.entries());
    let i = 0;

    while (i < entries.length) {
      const [key, value] = entries[i];
      result[key.toLowerCase()] = value;
      i++;
    }

    return result;
  }

  /**
   * Returns the value of a query parameter by name.
   * @param name - The query parameter name.
   */
  getQuery(name: string): string | undefined {
    return this.getQueries()[name];
  }

  /**
   * Returns all query parameters as a key-value object.
   */
  getQueries<T extends Record<string, string> = Record<string, string>>(): T {
    const url = this.raw.url;
    const qmark = url.indexOf("?");
    if (qmark === -1 || qmark === url.length - 1) return {} as T;

    const qstr = url.slice(qmark + 1);
    const result: Record<string, string> = {};

    let i = 0;
    while (i < qstr.length) {
      let amp = qstr.indexOf("&", i);
      if (amp === -1) amp = qstr.length;

      const pair = qstr.slice(i, amp);
      const eq = pair.indexOf("=");

      if (eq !== -1) {
        const key = decodeURIComponent(pair.slice(0, eq));
        const val = decodeURIComponent(pair.slice(eq + 1));
        result[key] = val;
      }

      i = amp + 1;
    }

    return result as T;
  }
}
