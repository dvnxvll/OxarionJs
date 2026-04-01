import type { ServerWebSocket } from "bun";
import type { OxarionRequest } from "./adapter/http/request";
import type { OxarionResponse } from "./adapter/http/response";
import type { RoutesWrapper } from "./adapter/http/route/wrapper";
import type { RenderData, TemplateOptions } from "./adapter/http/template";
import type { WSWatcher } from "./adapter/ws/watcher";

export type {
  RenderData,
  RenderOptions,
  TemplateOptions,
} from "./adapter/http/template";

/** Supported HTTP methods for route registration and dynamic routing. */
export type Method =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

/** Shared service registry shape used by `router.provide()` and `req.getService()`. */
export type ServiceMap = Record<string, unknown>;

/** Allowed handler return values for HTTP routes and framework hooks. */
export type HandlerResult = void | Response | OxarionResponse;

/** Standard HTTP route handler signature. */
export type Handler<
  TParams extends Record<string, any> = Record<string, any>,
  TServices extends ServiceMap = ServiceMap,
> = (
  req: OxarionRequest<TParams, TServices>,
  res: OxarionResponse,
) => HandlerResult | Promise<HandlerResult>;

/** Param shape used by file-based dynamic route modules. */
export type DynamicRouteParams = Record<string, string | string[] | undefined>;

/** Handler signature used inside dynamic route files. */
export type DynamicRouteHandler<
  TParams extends DynamicRouteParams = DynamicRouteParams,
  TServices extends ServiceMap = ServiceMap,
> = (
  req: OxarionRequest<TParams, TServices>,
  res: OxarionResponse,
) => HandlerResult | Promise<HandlerResult>;

/** Map of HTTP methods to handlers, used as the default export of dynamic route files. */
export type DynamicRouteExportMap = Partial<
  Record<Method, DynamicRouteHandler<any, any>>
>;

/** Class-based dynamic route module with method handlers as static properties. */
export type DynamicRouteClass = {
  new (...args: any[]): unknown;
} & DynamicRouteExportMap;

/** Shape of a file-based dynamic route module, supporting both object and class exports. */
export type DynamicRouteModule = DynamicRouteExportMap & {
  default?: DynamicRouteClass;
  [key: string]: unknown;
};

/** Global application error handler signature. */
export type ErrorHandler = (
  error: unknown,
  req: OxarionRequest<any>,
  res: OxarionResponse,
) => HandlerResult | Promise<HandlerResult>;

/** Lifecycle hook names supported by `router.hook()`. */
export type HookName =
  | "onRequest"
  | "preHandler"
  | "onSend"
  | "onResponse"
  | "onError";

export type OnRequestHook<TServices extends ServiceMap = ServiceMap> = (
  req: OxarionRequest<any, TServices>,
  res: OxarionResponse,
) => void | Promise<void>;

export type PreHandlerHook<TServices extends ServiceMap = ServiceMap> = (
  req: OxarionRequest<any, TServices>,
  res: OxarionResponse,
) => void | Promise<void>;

export type OnSendHook<TServices extends ServiceMap = ServiceMap> = (
  req: OxarionRequest<any, TServices>,
  res: OxarionResponse,
) => void | Promise<void>;

export type OnResponseHook<TServices extends ServiceMap = ServiceMap> = (
  req: OxarionRequest<any, TServices>,
  res: Response,
) => void | Promise<void>;

export type OnErrorHook<TServices extends ServiceMap = ServiceMap> = (
  error: unknown,
  req: OxarionRequest<any, TServices>,
  res: OxarionResponse,
) => void | Promise<void>;

export type HookMap<TServices extends ServiceMap = ServiceMap> = {
  /** Fired when a request is first received, before routing. */
  onRequest: OnRequestHook<TServices>;
  /** Fired just before the route handler executes. */
  preHandler: PreHandlerHook<TServices>;
  /** Fired after the handler runs, before the response is sent. */
  onSend: OnSendHook<TServices>;
  /** Fired after the response has been sent to the client. */
  onResponse: OnResponseHook<TServices>;
  /** Fired when an error is thrown during request processing. */
  onError: OnErrorHook<TServices>;
};

/** Internal route metadata stored after registration. */
export type RouteHooks<TServices extends ServiceMap = ServiceMap> = {
  /** Registered `onRequest` hooks for this route. */
  onRequest: OnRequestHook<TServices>[];
  /** Registered `preHandler` hooks for this route. */
  preHandler: PreHandlerHook<TServices>[];
  /** Registered `onSend` hooks for this route. */
  onSend: OnSendHook<TServices>[];
  /** Registered `onResponse` hooks for this route. */
  onResponse: OnResponseHook<TServices>[];
  /** Registered `onError` hooks for this route. */
  onError: OnErrorHook<TServices>[];
};

/** Hierarchical dependency injection container for scoped services. */
export type ServiceContainer = {
  /** Parent container to fall back to when a key is not found locally. */
  parent: ServiceContainer | null;
  /** Service values stored at this scope level. */
  values: Map<string, unknown>;
};

/** Scoped context attached to a route, containing its service container and registered hooks. */
export type RouteScope<TServices extends ServiceMap = ServiceMap> = {
  /** Dependency injection container for this scope. */
  services: ServiceContainer;
  /** Lifecycle hooks registered for routes in this scope. */
  hooks: RouteHooks<TServices>;
};

/** Compiled route record used by the router matcher. */
export interface Route {
  /** HTTP method this route responds to. */
  method: Method;
  /** Handler function invoked when this route matches. */
  handler: Handler;
  /** Pre-split URL segments for fast matching. */
  segments: string[];
  /** Names of dynamic path parameters extracted from the pattern. */
  paramNames: string[];
  /** Whether this route contains no dynamic segments. */
  isStatic: boolean;
  /** Original path pattern string (e.g. `/users/[id]`). */
  path: string;
  /** Optional OpenAPI metadata for spec generation. */
  openapi?: OpenApiRouteDefinition;
  /** Scoped services and hooks attached to this route. */
  scope?: RouteScope<any>;
}

/** Plugin function signature used by `router.register()`. */
export type RouterPlugin<
  TOptions = void,
  TServices extends ServiceMap = ServiceMap,
> = (
  router: OxarionRouter<TServices>,
  options: TOptions,
) => void | Promise<void>;

/** Public router API exposed inside `httpHandler`, groups, and plugins. */
export interface OxarionRouter<TServices extends ServiceMap = ServiceMap> {
  /** Register a normal HTTP route. */
  addHandler<Path extends string>(
    method: Method,
    path: Path,
    handler: Handler<ExtractRouteParams<Path>, TServices>,
  ): void;

  /** Register an HTTP route with OpenAPI metadata. */
  addHandlerOpenApi<Path extends string>(
    method: Method,
    path: Path,
    handler: Handler<ExtractRouteParams<Path>, TServices>,
    openapi: OpenApiRouteDefinition,
  ): void;

  /** @deprecated Use `mount()` instead. `injectWrapper()` will be removed in 1.5.x. */
  injectWrapper(base: string, wrapper: RoutesWrapper): void;
  /** Clearer alias for `injectWrapper()`. */
  mount(base: string, wrapper: RoutesWrapper): void;

  /** Register a scoped plugin that can add routes, hooks, and services. */
  register<TOptions = void>(
    plugin: RouterPlugin<TOptions, TServices>,
    ...args: TOptions extends void ? [] : [options: TOptions]
  ): this;

  /** Register a lifecycle hook for the current router scope. */
  hook<TName extends HookName>(
    name: TName,
    fn: HookMap<TServices>[TName],
  ): this;

  /** Provide a scoped service value that can be read through `req.getService()`. */
  provide<TKey extends string, TValue>(
    name: TKey,
    value: TValue,
  ): OxarionRouter<TServices & Record<TKey, TValue>>;

  /** Check whether the current router scope has a service key. */
  hasService(name: string): boolean;

  /** Register middleware for matching routes under a base path. */
  middleware(
    base: string,
    middleware_fn: MiddlewareFn,
    allRoutes?: boolean,
  ): void;
  /** Register multiple middleware functions for matching routes under a base path. */
  multiMiddleware(
    base: string,
    middlewares: MiddlewareFn[],
    allRoutes?: boolean,
  ): void;
  /** Serve files from a directory under the given URL prefix. */
  serveStatic(prefix: string, dir: string, options?: ServeStaticOptions): void;
  /** Serve the Oxarion dynamic HTML runtime and return its hashed script path. */
  serveOx(): string;
  /** Expose generated OpenAPI JSON under a route. */
  serveOpenApi(spec_path: string, options: ServeOpenApiOptions): void;
  /** Mark an HTTP path as a WebSocket upgrade endpoint. */
  switchToWs(path: string): void;
  /** Create a scoped route group with shared prefix and optional middleware. */
  group(
    base: string,
    callback: (router: OxarionRouter<TServices>) => void,
    middlewares?: MiddlewareFn[],
  ): void;
}

/** Narrow middleware registration surface used by `safeMwRegister`. */
export interface MiddlewareRegister {
  middleware(
    base: string,
    middleware_fn: MiddlewareFn,
    allRoutes?: boolean,
  ): void;
  multiMiddleware(
    base: string,
    middlewares: MiddlewareFn[],
    allRoutes?: boolean,
  ): void;
}

/** Synthetic request input accepted by `app.request()`. */
export type AppRequestInit = {
  /** HTTP method to use. Defaults to `"GET"`. */
  method?: Method;
  /** Request path (e.g. `/api/users`). */
  path: string;
  /** Optional request headers. */
  headers?: HeadersInit;
  /** Optional request body. */
  body?: BodyInit | null;
};

/** Options used to create an Oxarion app instance before it starts listening. */
export type OxarionCreateOptions = {
  /** Whether to check for the latest package version on startup. */
  checkLatestVersion?: boolean;
  /** Directory containing page template files. */
  pagesDir?: string;
  /** Whether to log registered routes to the console on startup. */
  debugRoutes?: boolean;
  /** Whether to cache compiled page templates in memory. */
  cachePages?: boolean;
  /** Template engine configuration. */
  template?: TemplateOptions;
  /** File-based dynamic routing configuration. */
  dynamicRouting?: DynamicRoutingOptions;
  /** Callback invoked with the router to register HTTP routes. */
  httpHandler: (router: OxarionRouter) => void;
  /** Callback invoked with a narrow register surface for safe middleware registration. */
  safeMwRegister?: (router: MiddlewareRegister) => void;
  /** Custom handler invoked when no route matches the request. */
  notFoundHandler?: Handler;
  /** Global error handler for uncaught errors during request processing. */
  errorHandler?: ErrorHandler;
  /** Callback invoked with the WebSocket watcher to register WS routes. */
  wsHandler?: (watcher: WSWatcher) => void;
};

/** Listening options passed to `Oxarion.start()` or `app.start()`. */
export type OxarionListenOptions = {
  /** Port number or string to listen on. Defaults to `3000`. */
  port?: string | number;
  /** Enable `SO_REUSEPORT` for multi-process load balancing. */
  reusePort?: boolean;
  /** Bind exclusively to IPv6 addresses. */
  ipv6Only?: boolean;
  /** Hostname or IP address to bind to. */
  host?: string;
  /** Unix domain socket path (mutually exclusive with port/host). */
  unix?: never;
  /** Seconds a connection can remain idle before being closed. */
  idleTimeout?: number;
};

/** Combined creation and listening options for full app configuration. */
export type OxarionOptions = OxarionCreateOptions & OxarionListenOptions;

/** Stateful Oxarion application instance returned by `Oxarion.create()`. */
export interface OxarionApp {
  /** Start the Bun server for this app instance. */
  start(options?: OxarionListenOptions): Promise<ReturnType<typeof Bun.serve>>;
  /** Stop the active Bun server for this app instance. */
  stop(): Promise<void>;
  /** Execute an in-process HTTP request through the same request pipeline. */
  request(input: string | AppRequestInit): Promise<Response>;
  /** Render a full HTML page from the configured `pages/` templates. */
  render(page: string, data?: RenderData): Promise<string>;
  /** Render an HTML fragment from the configured `fragments/` templates. */
  renderFragment(fragment: string, data?: RenderData): Promise<string>;
  /** Access the root router for advanced composition. */
  getRouter(): OxarionRouter;
}

/** Options for `router.serveStatic()`. */
export type ServeStaticOptions = {
  /** File to serve when the request targets a directory. Defaults to `"index.html"`. */
  indexFile?: string;
  /** Override the auto-detected MIME type for all served files. */
  contentType?: string;
  /** Enable `ETag` header generation for cache validation. */
  etag?: boolean;
  /** Enable `Last-Modified` header based on file mtime. */
  lastModified?: boolean;
  /** Override the `Cache-Control` header value. */
  cacheControl?: string;
  /** `max-age` value in seconds for `Cache-Control`. */
  maxAgeSeconds?: number;
};

/** OpenAPI `info` object. */
export type OpenApiInfo = {
  /** Title of the API. */
  title: string;
  /** Semantic version string of the API. */
  version: string;
  /** Optional longer description of the API. */
  description?: string;
};

/** OpenAPI server entry. */
export type OpenApiServer = {
  /** Server URL (e.g. `https://api.example.com`). */
  url: string;
  /** Human-readable description of this server. */
  description?: string;
};

/** Base OpenAPI document options. */
export type OpenApiOptions = {
  /** API metadata (title, version, etc.). */
  info: OpenApiInfo;
  /** List of server URLs where the API is available. */
  servers?: OpenApiServer[];
};

/** Options for `router.serveOpenApi()`. */
export type ServeOpenApiOptions = {
  /** API metadata (title, version, etc.). */
  info: OpenApiInfo;
  /** List of server URLs where the API is available. */
  servers?: OpenApiServer[];
  /** When `true`, the OpenAPI spec endpoint itself is excluded from the generated spec. */
  excludeEndpointFromSpec?: boolean;
};

/** File transfer options for `res.sendFile()`. */
export type SendFileOptions = {
  /** Enable `ETag` header generation for cache validation. */
  etag?: boolean;
  /** Enable `Last-Modified` header based on file mtime. */
  lastModified?: boolean;
  /** Override the `Cache-Control` header value. */
  cacheControl?: string;
  /** `max-age` value in seconds for `Cache-Control`. */
  maxAgeSeconds?: number;
};

/** Options for `Middleware.rateLimit()`. */
export type RateLimitOptions = {
  /** Maximum number of requests allowed within the time window. */
  limit: number;
  /** Duration of the sliding window in milliseconds. */
  windowMs: number;
  /** Custom function to derive the rate limit key from the request. Defaults to client IP. */
  keyGenerator?: (req: OxarionRequest<any>) => string;
  /** HTTP status code returned when the limit is exceeded. Defaults to `429`. */
  statusCode?: number;
  /** Response body returned when the limit is exceeded. */
  message?: string;
  /** Whether to include `X-RateLimit-*` headers in the response. */
  includeHeaders?: boolean;
};

/** Internal in-memory rate limit bucket shape. */
export type RateLimitEntry = {
  /** Current request count within the window. */
  count: number;
  /** Timestamp (ms) when this bucket resets. */
  resetAtMs: number;
};

/** Strict-Transport-Security header options. */
export type HstsOptions = {
  /** `max-age` value in seconds. Defaults to `15552000` (180 days). */
  maxAgeSeconds?: number;
  /** Whether to include subdomains in the HSTS policy. */
  includeSubDomains?: boolean;
  /** Whether to request inclusion in browser preload lists. */
  preload?: boolean;
};

/** Options for `Middleware.securityHeaders()`. */
export type SecurityHeadersOptions = {
  /** Content-Security-Policy header value. */
  contentSecurityPolicy?: string;
  /** Referrer-Policy header value. */
  referrerPolicy?: string;
  /** Permissions-Policy header value. */
  permissionsPolicy?: string;
  /** X-Frame-Options header value. */
  xFrameOptions?: "DENY" | "SAMEORIGIN";
  /** HSTS configuration, or `false` to disable. */
  hsts?: HstsOptions | false;
};

/** Options for the built-in session middleware. */
export type SessionOptions = {
  /** Name of the session cookie. Defaults to `"sid"`. */
  cookieName?: string;
  /** Session time-to-live in milliseconds. */
  ttlMs?: number;
  /** Cookie path attribute. Defaults to `"/"`. */
  path?: string;
  /** Cookie `SameSite` attribute. */
  sameSite?: "lax" | "strict" | "none";
  /** Whether the cookie requires HTTPS. */
  secure?: boolean;
  /** Whether the cookie is inaccessible to client-side JavaScript. */
  httpOnly?: boolean;
  /** Reset TTL on each request (sliding expiration). */
  rolling?: boolean;
  /** Custom storage backend. Defaults to an in-memory `Map`. */
  store?: SessionStore;
  /** Custom session ID generator function. */
  createId?: () => string;
};

/** Internal in-memory session store entry. */
export type SessionEntry = {
  /** Arbitrary session data. */
  data: Record<string, unknown>;
  /** Timestamp (ms) when this entry expires. */
  expiresAtMs: number;
};

/** Storage backend used by `Middleware.session()`. */
export type SessionStore = {
  /** Retrieve a session entry by ID, or `null`/`undefined` if not found. */
  get(
    session_id: string,
  ): SessionEntry | null | undefined | Promise<SessionEntry | null | undefined>;
  /** Store or update a session entry. */
  set(session_id: string, entry: SessionEntry): void | Promise<void>;
  /** Delete a session entry by ID. */
  delete?(session_id: string): void | Promise<void>;
  /** Remove all expired entries. Called periodically by the middleware. */
  cleanup?(now_ms: number): void | Promise<void>;
};

/** Options for the built-in CSRF middleware. Session middleware must run first. */
export type CsrfOptions = {
  /** Session key where the CSRF token is stored. Defaults to `"csrfToken"`. */
  sessionKey?: string;
  /** Name of the cookie carrying the CSRF secret. Defaults to `"csrfSecret"`. */
  cookieName?: string;
  /** Form field or header name checked for the CSRF token. Defaults to `"_csrf"`. */
  fieldName?: string;
  /** Cookie path attribute. Defaults to `"/"`. */
  path?: string;
  /** Cookie `SameSite` attribute. */
  sameSite?: "lax" | "strict" | "none";
  /** Whether the cookie requires HTTPS. */
  secure?: boolean;
};

/** Options for the built-in Redis session store helper. */
export type RedisSessionStoreOptions = {
  /** Redis connection URL (e.g. `redis://localhost:6379`). */
  url?: string;
  /** Key prefix for session entries. Defaults to `"sess:"`. */
  prefix?: string;
  /** Pre-existing Redis client instance. If provided, `url` is ignored. */
  client?: RedisSessionClient;
};

/** Minimal Redis client shape used by the built-in Redis session store helper. */
export type RedisSessionClient = {
  /** Get a value by key. */
  get(key: string): string | null | Promise<string | null>;
  /** Set a value by key. */
  set(key: string, value: string): unknown | Promise<unknown>;
  /** Delete a key. */
  del(key: string): unknown | Promise<unknown>;
  /** Set a key's TTL in seconds. */
  expire(key: string, ttl_seconds: number): unknown | Promise<unknown>;
  /** Close the Redis connection. */
  close?: () => void;
};

/** Discriminated union result from a schema validation attempt. */
export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: unknown };

/** Minimal schema interface compatible with Zod-like validators. */
export type SafeParseSchema<T> = {
  /** Parse and validate an unknown value, returning a safe result. */
  safeParse: (value: unknown) => SafeParseResult<T>;
};

/** Error response body returned when request validation fails. */
export type ValidationErrorShape = {
  /** Human-readable error message. */
  error: string;
  /** Optional structured validation error details. */
  details?: unknown;
};

/** Options for validation middleware failure responses. */
export type ValidationOptions = {
  /** HTTP status code on validation failure. Defaults to `400`. */
  statusCode?: number;
  /** Override the default error message. */
  message?: string;
  /** Whether to include validation error details in the response body. */
  includeDetails?: boolean;
};

/** Minimal OpenAPI schema object used by route metadata helpers. */
export type OpenApiSchema = {
  /** JSON Schema type (e.g. `"string"`, `"number"`, `"object"`). */
  type?: string;
  /** Format hint (e.g. `"int64"`, `"date-time"`). */
  format?: string;
  /** Schema for array item types. */
  items?: OpenApiSchema;
  /** Schemas for object properties. */
  properties?: Record<string, OpenApiSchema>;
  /** List of required property names. */
  required?: string[];
  /** Allowed values for an enum field. */
  enum?: string[];
  /** Human-readable description of this schema node. */
  description?: string;
  /** Schema or flag for additional/unexpected properties. */
  additionalProperties?: boolean | OpenApiSchema;
};

/** OpenAPI route parameter metadata. */
export type OpenApiParameter = {
  /** Parameter name as it appears in the URL. */
  name: string;
  /** Location of the parameter. Currently only `"path"` is supported. */
  in: "path";
  /** Whether this parameter is required. */
  required: boolean;
  /** Schema describing the parameter value. */
  schema: OpenApiSchema;
  /** Human-readable description of the parameter. */
  description?: string;
};

/** OpenAPI request body metadata. */
export type OpenApiRequestBody = {
  /** Media type of the request body (e.g. `"application/json"`). */
  contentType?: string;
  /** Whether the request body is required. */
  required?: boolean;
  /** Schema describing the request body. */
  schema: OpenApiSchema;
};

/** OpenAPI response body metadata. */
export type OpenApiResponseBody = {
  /** Human-readable description of this response. */
  description?: string;
  /** Media type of the response body (e.g. `"application/json"`). */
  contentType?: string;
  /** Schema describing the response body. */
  schema?: OpenApiSchema;
};

/** Map of HTTP status codes to response body descriptions for OpenAPI specs. */
export type OpenApiResponses = Record<string, OpenApiResponseBody>;

/** OpenAPI metadata attached to a route via `addHandlerOpenApi()`. */
export type OpenApiRouteDefinition = {
  /** Path and query parameters for this endpoint. */
  parameters?: OpenApiParameter[];
  /** Request body schema and metadata. */
  requestBody?: OpenApiRequestBody;
  /** Response schemas keyed by HTTP status code. */
  responses?: OpenApiResponses;
};

/** Compression options for `res.sendPage()`. */
export type PageCompression =
  | {
      /** Compression algorithm. */
      type: "gzip";
      /** Compression level (`-1` = default, `0`-`9` from fastest to best). */
      level?: -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      /** Memory level (`1`-`9`, higher uses more memory for better speed). */
      memLevel?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      /** Logarithmic window size (`9`-`15` or negatives for raw deflate). */
      windowBits?:
        | -9
        | -10
        | -11
        | -12
        | -13
        | -14
        | -15
        | 9
        | 10
        | 11
        | 12
        | 13
        | 14
        | 15
        | 25
        | 26
        | 27
        | 28
        | 29
        | 30
        | 31;
      /** Compression strategy (e.g. `0` = default, `2` = Huffman). */
      strategy?: number;
    }
  | {
      /** Compression algorithm. */
      type: "zstd";
      /** Zstandard compression level (`1`-`22`, higher is better ratio). */
      level?:
        | 1
        | 2
        | 3
        | 4
        | 5
        | 6
        | 7
        | 8
        | 9
        | 10
        | 11
        | 12
        | 13
        | 14
        | 15
        | 16
        | 17
        | 18
        | 19
        | 20
        | 21
        | 22;
    };

/** HTTP middleware signature used by `router.middleware()` and `multiMiddleware()`. */
export type MiddlewareFn = (
  req: OxarionRequest<any>,
  res: OxarionResponse,
  next: () => Promise<HandlerResult>,
) => void | Promise<void>;

/** File-based dynamic routing configuration. */
export interface DynamicRoutingOptions {
  /** Whether dynamic routing is enabled. Defaults to `true` when `dir` is provided. */
  enabled?: boolean;
  /** Root directory containing dynamic route files. */
  dir: string;
  /** Custom filename for the route handler module. */
  handlerFile?: string;
  /** File extensions to scan for route modules. Defaults to `[".ts", ".js"]`. */
  extensions?: string[];
  /** How to handle conflicts between dynamic and manually registered routes. */
  onConflict?: "error" | "override" | "keepManual";
}

/** Extract typed path params from route patterns like `/users/[id]`. */
export type ExtractRouteParams<Path extends string> =
  Path extends `${infer _Start}/[...${infer Catch}]`
    ? { [K in Catch]: string[] | undefined } & ExtractSimpleParams<_Start>
    : ExtractSimpleParams<Path>;

/** Extract non-catch-all params from a route pattern. */
export type ExtractSimpleParams<Path extends string> =
  Path extends `${infer _Start}/[${infer Param}]${infer Rest}`
    ? { [K in Param]: string | undefined } & ExtractSimpleParams<Rest>
    : {};

/** WebSocket lifecycle handlers registered through `wsHandler`. */
export type WSHandler = {
  /** Called when a new WebSocket connection is opened. */
  onOpen?: (ws: ServerWebSocket<unknown>) => void;
  /** Called when a message is received on a WebSocket connection. */
  onMessage?: (
    ws: ServerWebSocket<unknown>,
    message: string | Uint8Array,
  ) => void;
  /** Called when a WebSocket connection is closed. */
  onClose?: (
    ws: ServerWebSocket<unknown>,
    code: number,
    reason: string,
  ) => void;
  /** Called when the WebSocket write buffer is drained and ready for more data. */
  onDrain?: (ws: ServerWebSocket<unknown>) => void;
};

/** Per-connection WebSocket context holding registered handlers. */
export interface WSContext {
  /** Lifecycle handlers for this connection. */
  handler?: WSHandler;
}

/** Runtime context passed through WebSocket message middleware and dispatchers. */
export type WSMessageContext = {
  /** The underlying Bun WebSocket instance. */
  ws: ServerWebSocket<unknown>;
  /** The raw message as received (string or binary). */
  raw_message: string | Uint8Array;
  /** The message decoded as a UTF-8 string. */
  message_text: string;
  /** Parsed JSON value, populated when the message is valid JSON. */
  json?: unknown;
};

/** Middleware signature for JSON message processing in WebSocket dispatchers. */
export type WSMessageMiddlewareFn = (
  ctx: WSMessageContext,
  next: () => Promise<void>,
) => void | Promise<void>;

/** Final message handler signature after middleware has completed. */
export type WSMessageFinalHandler = (
  ctx: WSMessageContext,
) => void | Promise<void>;

/** Minimal typed message shape used by `WebSocket.dispatcher()`. */
export type WsTypedMessage = {
  /** Discriminator field used to route the message to the correct handler. */
  type: string;
  /** Optional message payload. */
  payload?: unknown;
};

/** Handler map keyed by message `type` for the typed WebSocket dispatcher. */
export type WsDispatcherHandlers<
  TMessages extends WsTypedMessage = WsTypedMessage,
> = Partial<
  Record<
    TMessages["type"],
    (ctx: WSMessageContext, payload: any) => void | Promise<void>
  >
>;

/** Options for the typed WebSocket JSON dispatcher helper. */
export type WsDispatcherOptions<
  TMessages extends WsTypedMessage = WsTypedMessage,
> = {
  /** Handler map keyed by message `type`. */
  handlers: WsDispatcherHandlers<TMessages>;
  /** Middleware pipeline run before dispatching to a handler. */
  middlewares?: WSMessageMiddlewareFn[];
  /** Custom JSON parser. Defaults to `JSON.parse`. */
  parse?: (text: string) => TMessages;
  /** Custom function to extract the `type` field from a parsed message. */
  getType?: (json: TMessages) => TMessages["type"] | undefined;
  /** Custom function to extract the `payload` field from a parsed message. */
  getPayload?: (json: TMessages) => unknown;
  /** Handler called when a message `type` has no registered handler. */
  onUnknown?: (ctx: WSMessageContext) => void | Promise<void>;
  /** Handler called when parsing or dispatching throws an error. */
  onError?: (error: unknown, ctx: WSMessageContext) => void | Promise<void>;
};

/** Writable stream facade exposed by `res.stream()`. */
export type StreamWriter = {
  /** Write a chunk to the response stream. */
  write(chunk: string | Uint8Array): Promise<void>;
  /** Close the stream and finalize the response. */
  close(): Promise<void>;
};

/** Callback signature used by `res.stream()`. */
export type StreamHandler = (writer: StreamWriter) => void | Promise<void>;

/** SSE writer facade exposed by `res.sse()`. */
export type SseWriter = {
  /** Send a named event with a data payload and optional ID. */
  send(event: string, data: unknown, id?: string): Promise<void>;
  /** Send a comment line (ignored by `EventSource` but useful for keep-alive). */
  comment(text: string): Promise<void>;
  /** Close the SSE connection. */
  close(): Promise<void>;
};

/** Callback signature used by `res.sse()`. */
export type SseHandler = (sse: SseWriter) => void | Promise<void>;
