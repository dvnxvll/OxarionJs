import { ParsedFormData } from "../../form_data";
import type { ServiceContainer, ServiceMap } from "../../types";
import { service_get, service_has } from "./service/container";

export class OxarionRequest<
  TParams extends Record<string, any>,
  TServices extends ServiceMap = ServiceMap,
> {
  constructor(
    public readonly raw: Request,
    private readonly params: TParams,
    private readonly services: ServiceContainer | null = null,
  ) {}

  private _cookies_cache: Record<string, string> | null = null;
  private _queries_cache: Record<string, string> | null = null;

  private _body: unknown | null = null;
  private _body_is_set = false;

  private _session_id: string | null = null;
  private _session_data: Record<string, unknown> | null = null;
  private _session_modified = false;
  private _csrf_token: string | null = null;

  private parse_cookies(): Record<string, string> {
    const cookie_header = this.raw.headers.get("cookie");
    if (!cookie_header) return {};

    return Object.fromEntries(
      cookie_header.split(";").map((c) => {
        const [key, ...v] = c.split("=");
        return [key.trim(), v.join("=").trim()];
      }),
    );
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

  /**
   * Gets the active CSRF token (if csrf middleware is enabled).
   */
  getCsrfToken(): string | undefined {
    return this._csrf_token ?? undefined;
  }

  __oxarion_set_session_state(
    session_id: string | null,
    session_data: Record<string, unknown>,
  ) {
    this._session_id = session_id;
    this._session_data = session_data;
    this._session_modified = false;
  }

  __oxarion_set_csrf_token(token: string) {
    this._csrf_token = token;
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
    return Object.fromEntries(this.raw.headers);
  }

  /**
   * Returns the value of a query parameter by name.
   * @param name - The query parameter name.
   */
  getQuery(name: string): string | undefined {
    return this.getQueries()[name];
  }

  private parse_queries(): Record<string, string> {
    return Object.fromEntries(new URL(this.raw.url).searchParams) as Record<
      string,
      string
    >;
  }

  /**
   * Returns all query parameters as a key-value object.
   */
  getQueries<T extends Record<string, string> = Record<string, string>>(): T {
    if (this._queries_cache) return this._queries_cache as T;
    this._queries_cache = this.parse_queries();
    return this._queries_cache as T;
  }

  hasService(name: string): boolean {
    return service_has(this.services, name);
  }

  getService<TKey extends keyof TServices>(name: TKey): TServices[TKey] {
    return service_get(this.services, String(name)) as TServices[TKey];
  }
}
