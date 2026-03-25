import type { ServerWebSocket } from "bun";
import type { OxarionRequest } from "./handler/request";
import type { OxarionResponse } from "./handler/response";
import { Router } from "./route/router";
import type { WSWatcher } from "./handler/ws";

export type Method =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

export type Handler = (
  req: OxarionRequest<any>,
  res: OxarionResponse,
) => HandlerResult | Promise<HandlerResult>;

export type HandlerResult = void | Response;

export type DynamicRouteParams = Record<string, string | string[] | undefined>;

export type DynamicRouteHandler<
  TParams extends DynamicRouteParams = DynamicRouteParams,
> = (
  req: OxarionRequest<TParams>,
  res: OxarionResponse,
) => HandlerResult | Promise<HandlerResult>;

export type DynamicRouteExportMap = Partial<
  Record<Method, DynamicRouteHandler<any>>
>;

export type DynamicRouteClass = {
  new (...args: any[]): unknown;
} & DynamicRouteExportMap;

export type DynamicRouteModule = DynamicRouteExportMap & {
  default?: DynamicRouteClass;
  [key: string]: unknown;
};

export type ErrorHandler = (
  error: unknown,
  req: OxarionRequest<any>,
  res: OxarionResponse,
) => HandlerResult | Promise<HandlerResult>;

export interface Route {
  method: Method;
  handler: Handler;
  segments: string[];
  paramNames: string[];
  isStatic: boolean;
  openapi?: OpenApiRouteDefinition;
}

export interface OxarionOptions {
  /**
   * What port should the server listen on?
   * @default process.env.PORT || "3000"
   */
  port?: string | number;

  /**
   * Whether the `SO_REUSEPORT` flag should be set.
   * This allows multiple processes to bind to the same port, which is useful for load balancing.
   * @default false
   */
  reusePort?: boolean;

  /**
   * Whether to check for the latest version of the package on startup.
   * If true, the server will attempt to check for updates.
   * @default true
   */
  checkLatestVersion?: boolean;

  /**
   * Whether the `IPV6_V6ONLY` flag should be set.
   * If true, the server will only accept IPv6 connections.
   * @default false
   */
  ipv6Only?: boolean;

  /**
   * What hostname should the server listen on?
   * If not set, listens on all interfaces ("0.0.0.0").
   * @default "0.0.0.0"
   * @example "127.0.0.1" // Only listen locally
   * @example "remix.run" // Only listen on remix.run
   * Note: hostname should not include a port.
   */
  host?: string;

  /**
   * If set, the HTTP server will listen on a unix socket instead of a port.
   * Cannot be used with hostname+port.
   */
  unix?: never;

  /**
   * Sets the number of seconds to wait before timing out a connection due to inactivity.
   * @default 10
   */
  idleTimeout?: number;

  /**
   * Function to register routes and handlers on the router.
   * Receives the OxarionRouter instance.
   */
  httpHandler: (router: OxarionRouter) => void;

  /**
   * Function to safely register middleware on the router.
   * Receives a MiddlewareRegister object with middleware and multiMiddleware methods.
   */
  safeMwRegister?: (router: MiddlewareRegister) => void;

  /**
   * Directory where html files are located.
   * If not set, defaults to "pages".
   */
  pagesDir?: string;

  /**
   * Enables debug logging for route matching and requests.
   * If true, logs route matches and timings to the console.
   * @default true
   */
  debugRoutes?: boolean;

  /**
   * If true, caches HTML pages in memory to make them load faster.
   * This will make the HTML static (changes to files won't be reflected until restart).
   * @default true
   */
  cachePages?: boolean;

  /**
   * Auto-register route modules from a directory.
   */
  dynamicRouting?: DynamicRoutingOptions;

  /**
   * Custom handler for requests that do not match any route.
   */
  notFoundHandler?: Handler;

  /**
   * Global error handler for route and notFound handler errors.
   */
  errorHandler?: ErrorHandler;

  /**
   * Function to register WebSocket route handlers.
   * Receives the WSWatcher instance for per-route WebSocket handling.
   */
  wsHandler?: (watcher: WSWatcher) => void;
}

export interface OxarionRouter {
  addHandler: Router["addHandler"];
  addHandlerOpenApi: Router["addHandlerOpenApi"];
  injectWrapper: Router["injectWrapper"];
  middleware: Router["middleware"];
  multiMiddleware: Router["multiMiddleware"];
  serveStatic: Router["serveStatic"];
  serveOpenApi: Router["serveOpenApi"];
  switchToWs: Router["switchToWs"];
  group: Router["group"];
}

export interface MiddlewareRegister {
  middleware: Router["middleware"];
  multiMiddleware: Router["multiMiddleware"];
}

export type ServeStaticOptions = {
  indexFile?: string;
  contentType?: string;
  etag?: boolean;
  lastModified?: boolean;
  cacheControl?: string;
  maxAgeSeconds?: number;
};

export type OpenApiInfo = {
  title: string;
  version: string;
  description?: string;
};

export type OpenApiServer = {
  url: string;
  description?: string;
};

export type OpenApiOptions = {
  info: OpenApiInfo;
  servers?: OpenApiServer[];
};

export type ServeOpenApiOptions = {
  info: OpenApiInfo;
  servers?: OpenApiServer[];
  /**
   * Optional: exclude the OpenAPI endpoint itself from `paths`.
   * @default true
   */
  excludeEndpointFromSpec?: boolean;
};

export type SendFileOptions = {
  etag?: boolean;
  lastModified?: boolean;
  cacheControl?: string;
  maxAgeSeconds?: number;
};

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
  keyGenerator?: (req: OxarionRequest<any>) => string;
  statusCode?: number;
  message?: string;
  includeHeaders?: boolean;
};

export type RateLimitEntry = {
  count: number;
  resetAtMs: number;
};

export type HstsOptions = {
  maxAgeSeconds?: number;
  includeSubDomains?: boolean;
  preload?: boolean;
};

export type SecurityHeadersOptions = {
  contentSecurityPolicy?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
  xFrameOptions?: "DENY" | "SAMEORIGIN";
  hsts?: HstsOptions | false;
};

export type SessionOptions = {
  cookieName?: string;
  ttlMs?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
  httpOnly?: boolean;
  rolling?: boolean;
};

export type SessionEntry = {
  data: Record<string, unknown>;
  expiresAtMs: number;
};

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: unknown };

export type SafeParseSchema<T> = {
  safeParse: (value: unknown) => SafeParseResult<T>;
};

export type ValidationErrorShape = {
  error: string;
  details?: unknown;
};

export type ValidationOptions = {
  statusCode?: number;
  message?: string;
  includeDetails?: boolean;
};

export type OpenApiSchema = {
  type?: string;
  format?: string;
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  enum?: string[];
  description?: string;
  additionalProperties?: boolean | OpenApiSchema;
};

export type OpenApiParameter = {
  name: string;
  in: "path";
  required: boolean;
  schema: OpenApiSchema;
  description?: string;
};

export type OpenApiRequestBody = {
  contentType?: string;
  required?: boolean;
  schema: OpenApiSchema;
};

export type OpenApiResponseBody = {
  description?: string;
  contentType?: string;
  schema?: OpenApiSchema;
};

export type OpenApiResponses = Record<string, OpenApiResponseBody>;

export type OpenApiRouteDefinition = {
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: OpenApiResponses;
};

export type PageCompression =
  | {
      type: "gzip";
      /**
       * The compression level to use. Must be between `-1` and `9`.
       * - A value of `-1` uses the default compression level (Currently `6`)
       * - A value of `0` gives no compression
       * - A value of `1` gives least compression, fastest speed
       * - A value of `9` gives best compression, slowest speed
       */
      level?: -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      /**
       * How much memory should be allocated for the internal compression state.
       *
       * A value of `1` uses minimum memory but is slow and reduces compression ratio.
       *
       * A value of `9` uses maximum memory for optimal speed. The default is `8`.
       */
      memLevel?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
      /**
       * The base 2 logarithm of the window size (the size of the history buffer).
       *
       * Larger values of this parameter result in better compression at the expense of memory usage.
       *
       * The following value ranges are supported:
       * - `9..15`: The output will have a zlib header and footer (Deflate)
       * - `-9..-15`: The output will **not** have a zlib header or footer (Raw Deflate)
       * - `25..31` (16+`9..15`): The output will have a gzip header and footer (gzip)
       *
       * The gzip header will have no file name, no extra data, no comment, no modification time (set to zero) and no header CRC.
       */
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
      /**
       * Tunes the compression algorithm.
       *
       * - `Z_DEFAULT_STRATEGY`: For normal data **(Default)**
       * - `Z_FILTERED`: For data produced by a filter or predictor
       * - `Z_HUFFMAN_ONLY`: Force Huffman encoding only (no string match)
       * - `Z_RLE`: Limit match distances to one (run-length encoding)
       * - `Z_FIXED` prevents the use of dynamic Huffman codes
       *
       * `Z_RLE` is designed to be almost as fast as `Z_HUFFMAN_ONLY`, but give better compression for PNG image data.
       *
       * `Z_FILTERED` forces more Huffman coding and less string matching, it is
       * somewhat intermediate between `Z_DEFAULT_STRATEGY` and `Z_HUFFMAN_ONLY`.
       * Filtered data consists mostly of small values with a somewhat random distribution.
       */
      strategy?: number;
    }
  | {
      type: "zstd";
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

export type MiddlewareFn = (
  req: OxarionRequest<any>,
  res: OxarionResponse,
  next: () => Promise<HandlerResult>,
) => void | Promise<void>;

export interface DynamicRoutingOptions {
  /**
   * Enables dynamic route registration.
   * @default true
   */
  enabled?: boolean;

  /**
   * Directory that contains route folders.
   * @example "dyn"
   */
  dir: string;

  /**
   * Handler file name without extension.
   * @default "api"
   */
  handlerFile?: string;

  /**
   * Allowed handler file extensions.
   * @default ["ts", "js"]
   */
  extensions?: string[];

  /**
   * Conflict strategy when manual and dynamic routes match.
   * @default "keepManual"
   */
  onConflict?: "error" | "override" | "keepManual";
}

export type ExtractRouteParams<Path extends string> =
  Path extends `${infer _Start}/[...${infer Catch}]`
    ? { [K in Catch]: string[] | undefined } & ExtractSimpleParams<_Start>
    : ExtractSimpleParams<Path>;

export type ExtractSimpleParams<Path extends string> =
  Path extends `${infer _Start}/[${infer Param}]${infer Rest}`
    ? { [K in Param]: string | undefined } & ExtractSimpleParams<Rest>
    : {};

export type WSHandler = {
  onOpen?: (ws: ServerWebSocket<unknown>) => void;
  onMessage?: (
    ws: ServerWebSocket<unknown>,
    message: string | Uint8Array,
  ) => void;
  onClose?: (
    ws: ServerWebSocket<unknown>,
    code: number,
    reason: string,
  ) => void;
  onDrain?: (ws: ServerWebSocket<unknown>) => void;
};

export interface WSContext {
  handler?: WSHandler;
}

export type WSMessageContext = {
  ws: ServerWebSocket<unknown>;
  raw_message: string | Uint8Array;
  message_text: string;
  json?: unknown;
};

export type WSMessageMiddlewareFn = (
  ctx: WSMessageContext,
  next: () => Promise<void>,
) => void | Promise<void>;

export type WSMessageFinalHandler = (
  ctx: WSMessageContext,
) => void | Promise<void>;

export type WsTypedMessage = {
  type: string;
  payload?: unknown;
};

export type WsDispatcherHandlers<
  TMessages extends WsTypedMessage = WsTypedMessage,
> = Partial<
  Record<
    TMessages["type"],
    (ctx: WSMessageContext, payload: any) => void | Promise<void>
  >
>;

export type WsDispatcherOptions<
  TMessages extends WsTypedMessage = WsTypedMessage,
> = {
  handlers: WsDispatcherHandlers<TMessages>;
  getType?: (json: unknown) => string | undefined;
  getPayload?: (json: unknown) => unknown;
  parse?: (text: string) => unknown;
  onUnknown?: (ctx: WSMessageContext) => void | Promise<void>;
  onError?: (err: unknown, ctx: WSMessageContext) => void | Promise<void>;
  middlewares?: WSMessageMiddlewareFn[];
};

declare module "bun" {
  interface ServeOptions {
    websocket?: {
      open?: (ws: ServerWebSocket<WSContext>) => void;
      message?: (
        ws: ServerWebSocket<WSContext>,
        message: string | Uint8Array,
      ) => void;
      close?: (
        ws: ServerWebSocket<WSContext>,
        code: number,
        reason: string,
      ) => void;
      drain?: (ws: ServerWebSocket<WSContext>) => void;
    };
  }
}
