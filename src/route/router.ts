import type { OxarionRequest } from "../handler/request";
import type {
  Route,
  Method,
  ExtractRouteParams,
  Handler,
  HandlerResult,
  MiddlewareFn,
  OxarionRouter,
  ServeStaticOptions,
  ServeOpenApiOptions,
  OpenApiRouteDefinition,
} from "../types";
import { symbl_get_routes, type RoutesWrapper } from "./wrapper";
import { compose_middleware } from "../utils/middleware";
import { parse_url_path } from "../utils/parse_url";
import { extname, resolve, sep } from "path";
import { OxarionResponse } from "../handler/response";
import { generate_openapi_spec } from "../openapi/generate_openapi";
import { SimpleLRU } from "../utils/simple_lru";

const CWD = process.cwd();

const ext_content_type = (file_path: string): string => {
  const ext = extname(file_path).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
};

const build_rel_path = (
  segments: string[] | undefined,
  index_file: string,
): string => {
  if (!segments || !segments.length) return index_file;
  let rel = segments[0];
  let i = 1;
  while (i < segments.length) rel += "/" + segments[i++];
  return rel;
};

export class Router {
  private routes: Route[] = [];
  private static_routes = new Map<string, Route>();
  private match_cache = new SimpleLRU<
    string,
    [Route, Record<string, string | string[]>]
  >(1000);
  private ws_routes = new Map<string, boolean>();

  private clean_base_path(path: string): string {
    if (path === "/") return "/";
    return path.replace(/\/+$/, "");
  }

  private join_paths(base: string, path: string): string {
    if (path[0] !== "/")
      throw new Error(
        `[Oxarion] group: path must start with '/', received: "${path}"`,
      );

    if (path === "/") return base;
    if (base === "/") return path;
    return base + path;
  }

  private wrap_handler_with_middleware(
    handler: Handler,
    middlewares: MiddlewareFn[],
  ): Handler {
    if (!middlewares.length) return handler;
    return (req, res) => compose_middleware(middlewares, handler)(req, res);
  }

  private create_group_router(
    base: string,
    middlewares: MiddlewareFn[],
  ): OxarionRouter {
    return {
      addHandler: (method, path, handler) => {
        const full_path = this.join_paths(base, path);
        this.addHandler(
          method,
          full_path as any,
          this.wrap_handler_with_middleware(handler as any, middlewares) as any,
        );
      },
      addHandlerOpenApi: (method, path, handler, openapi) => {
        const full_path = this.join_paths(base, path);
        this.addHandlerOpenApi(
          method,
          full_path as any,
          this.wrap_handler_with_middleware(handler as any, middlewares) as any,
          openapi,
        );
      },
      injectWrapper: (group_base, wrapper) => {
        const full_base = this.join_paths(base, group_base);
        this.injectWrapper(full_base, wrapper);
      },
      middleware: (group_base, middleware_fn, all_routes = false) => {
        const target_base = all_routes
          ? base
          : this.join_paths(base, this.clean_base_path(group_base));
        this.middleware(target_base, middleware_fn, false);
      },
      multiMiddleware: (group_base, chain, all_routes = false) => {
        const target_base = all_routes
          ? base
          : this.join_paths(base, this.clean_base_path(group_base));
        this.multiMiddleware(target_base, chain, false);
      },
      serveStatic: (prefix, dir, options) => {
        this.serveStatic(this.join_paths(base, prefix), dir, options);
      },
      serveOpenApi: (spec_path, options) => {
        this.serveOpenApi(this.join_paths(base, spec_path), options);
      },
      switchToWs: (path) => {
        this.switchToWs(this.join_paths(base, path));
      },
      group: (group_base, callback, chain = []) => {
        const full_base = this.join_paths(
          base,
          this.clean_base_path(group_base),
        );
        const full_chain =
          middlewares.length && chain.length
            ? middlewares.concat(chain)
            : middlewares.length
              ? middlewares
              : chain;
        callback(this.create_group_router(full_base, full_chain));
      },
    };
  }

  private parse_path_segments(path: string): {
    segments: string[];
    paramNames: string[];
    isStatic: boolean;
  } {
    const segments: string[] = [];
    const paramNames: string[] = [];
    let isStatic = true;
    let i = 1;
    let start = 1;

    while (i <= path.length) {
      if (i === path.length || path[i] === "/") {
        if (i > start) {
          const segment = path.slice(start, i);
          segments.push(segment);
          if (segment[0] === "[") {
            isStatic = false;
            const is_catch_all = segment.startsWith("[...");
            paramNames.push(
              is_catch_all ? segment.slice(4, -1) : segment.slice(1, -1),
            );
          }
        }
        start = i + 1;
      }
      i++;
    }
    return { segments, paramNames, isStatic };
  }

  /**
   * Registers a route handler for a specific HTTP method and path.
   * @template Path - The route path string type.
   * @param method - The HTTP method (e.g., "GET", "POST").
   * @param path - The route path (must start with "/").
   * @param handler - The function to handle the request and response.
   */
  addHandler<Path extends string>(
    method: Method,
    path: Path,
    handler: (
      req: OxarionRequest<ExtractRouteParams<Path>>,
      res: OxarionResponse,
    ) => HandlerResult | Promise<HandlerResult>,
  ) {
    if (typeof method !== "string")
      throw new TypeError("[Oxarion] addHandler: method must be a string");
    if (typeof path !== "string")
      throw new TypeError("[Oxarion] addHandler: path must be a string");
    if (typeof handler !== "function")
      throw new TypeError("[Oxarion] addHandler: handler must be a function");
    if (path[0] !== "/")
      throw new Error(
        `[Oxarion] addHandler: path must start with '/', received: "${path}"`,
      );

    const { segments, paramNames, isStatic } = this.parse_path_segments(path);

    const route: Route = {
      method,
      handler: handler as Handler,
      segments,
      paramNames,
      isStatic,
      path,
    };

    this.routes.push(route);

    if (isStatic) {
      this.static_routes.set(`${method}:${path}`, route);
    }
  }

  addHandlerOpenApi<Path extends string>(
    method: Method,
    path: Path,
    handler: (
      req: OxarionRequest<ExtractRouteParams<Path>>,
      res: OxarionResponse,
    ) => HandlerResult | Promise<HandlerResult>,
    openapi: OpenApiRouteDefinition,
  ) {
    if (typeof method !== "string")
      throw new TypeError(
        "[Oxarion] addHandlerOpenApi: method must be a string",
      );
    if (typeof path !== "string")
      throw new TypeError("[Oxarion] addHandlerOpenApi: path must be a string");
    if (typeof handler !== "function")
      throw new TypeError(
        "[Oxarion] addHandlerOpenApi: handler must be a function",
      );
    if (typeof openapi !== "object" || openapi === null)
      throw new TypeError(
        "[Oxarion] addHandlerOpenApi: openapi must be an object",
      );
    if (path[0] !== "/")
      throw new Error(
        `[Oxarion] addHandlerOpenApi: path must start with '/', received: "${path}"`,
      );

    const { segments, paramNames, isStatic } = this.parse_path_segments(path);

    const route: Route = {
      method,
      handler: handler as Handler,
      segments,
      paramNames,
      isStatic,
      path,
      openapi,
    };

    this.routes.push(route);

    if (isStatic) this.static_routes.set(`${method}:${path}`, route);
  }

  /**
   * Marks a route as a WebSocket endpoint.
   * @param path - The WebSocket route path (must start with '/').
   * @throws If path is not a string or does not start with '/'.
   */
  switchToWs(path: string) {
    if (typeof path !== "string")
      throw new TypeError("[Oxarion] switchToWs: path must be a string");
    if (path[0] !== "/")
      throw new Error(
        `[Oxarion] switchToWs: path must start with '/', received: "${path}"`,
      );

    this.ws_routes.set(path, true);
  }

  /**
   * Serves files from a directory under a given route prefix.
   * Uses traversal protection and forwards caching to `res.sendFile()`.
   */
  serveStatic(prefix: string, dir: string, options: ServeStaticOptions = {}) {
    if (typeof prefix !== "string")
      throw new TypeError("[Oxarion] serveStatic: prefix must be a string");
    if (typeof dir !== "string" || !dir)
      throw new TypeError(
        "[Oxarion] serveStatic: dir must be a non-empty string",
      );
    if (prefix[0] !== "/")
      throw new Error(
        `[Oxarion] serveStatic: prefix must start with '/', received: "${prefix}"`,
      );

    const normalized_prefix = prefix === "/" ? "/" : prefix.replace(/\/+$/, "");
    const static_root = resolve(CWD, dir);
    const index_file = options.indexFile ?? "index.html";

    const catch_all_route =
      normalized_prefix === "/"
        ? "/[...path]"
        : `${normalized_prefix}/[...path]`;

    const index_route = normalized_prefix === "/" ? "/" : normalized_prefix;

    const cache_options = {
      etag: options.etag,
      lastModified: options.lastModified,
      cacheControl: options.cacheControl,
      maxAgeSeconds: options.maxAgeSeconds,
    };

    const serve_handler = async (
      req: OxarionRequest<any>,
      res: OxarionResponse,
    ) => {
      const project_root = resolve(CWD);
      const full_path = (() => {
        const segments = (req.getParam("path") as string[] | undefined) || [];
        const rel = build_rel_path(segments, index_file);
        const resolved = resolve(static_root, rel);
        const inside_static_root =
          resolved === static_root || resolved.startsWith(static_root + sep);
        if (!inside_static_root) return null;
        return resolved;
      })();

      if (!full_path) {
        res
          .setStatus(403)
          .send("Forbidden: Static asset path is outside the allowed root.");
        return;
      }

      const inside_project_root =
        full_path === project_root || full_path.startsWith(project_root + sep);

      if (!inside_project_root) {
        res
          .setStatus(403)
          .send("Forbidden: Static asset path is outside project directory.");
        return;
      }

      const content_type = options.contentType ?? ext_content_type(full_path);
      const relative_to_project = full_path.slice(project_root.length + 1);

      await res.sendFile(relative_to_project, content_type, cache_options);
    };

    this.addHandler("GET", index_route, async (_req, res) => {
      const req_any = _req as OxarionRequest<any>;
      await serve_handler(req_any, res);
    });
    this.addHandler("HEAD", index_route, async (_req, res) => {
      const req_any = _req as OxarionRequest<any>;
      await serve_handler(req_any, res);
    });

    this.addHandler("GET", catch_all_route, serve_handler);
    this.addHandler("HEAD", catch_all_route, serve_handler);
  }

  /**
   * Serves a generated OpenAPI JSON spec for all registered HTTP routes.
   * The spec is generated on first request and cached in-memory.
   */
  serveOpenApi(spec_path: string, options: ServeOpenApiOptions) {
    if (typeof spec_path !== "string" || !spec_path)
      throw new TypeError(
        "[Oxarion] serveOpenApi: spec_path must be a non-empty string",
      );
    if (spec_path[0] !== "/")
      throw new Error(
        `[Oxarion] serveOpenApi: spec_path must start with '/', received: "${spec_path}"`,
      );
    if (typeof options !== "object" || options === null)
      throw new TypeError("[Oxarion] serveOpenApi: options must be an object");

    const exclude_endpoint = options.excludeEndpointFromSpec ?? true;
    let cached_spec: Record<string, unknown> | null = null;

    this.addHandler("GET", spec_path, async (_req, _res) => {
      if (!cached_spec) {
        const routes = this.dump_routes().filter((r) => {
          if (!exclude_endpoint) return true;
          return r.path !== spec_path;
        });

        cached_spec = generate_openapi_spec(routes, {
          info: options.info,
          servers: options.servers,
        });
      }

      return OxarionResponse.json(cached_spec);
    });
  }

  /**
   * Injects all routes from a RoutesWrapper under a given base path.
   * @param base - The base path to prefix to all injected routes.
   * @param wrapper - The RoutesWrapper instance containing routes to inject.
   * @throws If base is not a string or wrapper is not a valid RoutesWrapper.
   */
  injectWrapper(base: string, wrapper: RoutesWrapper) {
    if (typeof base !== "string")
      throw new TypeError("[Oxarion] injectWrapper: base must be a string");
    if (
      typeof wrapper !== "object" ||
      wrapper === null ||
      typeof wrapper[symbl_get_routes] !== "function"
    )
      throw new TypeError(
        "[Oxarion] injectWrapper: wrapper must be a RoutesWrapper",
      );

    const base_clean = base.replace(/\/$/, "");
    const routes = wrapper[symbl_get_routes]();

    let i = routes.length;
    while (i--) {
      const { method, path, handler } = routes[i];
      this.addHandler(
        method,
        `${base_clean}/${path.replace(/^\//, "")}`,
        handler,
      );
    }
  }

  /**
   * Applies a middleware function to routes matching a base path.
   * @param base - The base path to match (must start with "/").
   * @param middleware_fn - The middleware function to apply.
   * @param allRoutes - If true, applies to all routes; otherwise, only those starting with base.
   * @throws If base is not a string, does not start with "/", or middleware_fn is not a function.
   */
  middleware(base: string, middleware_fn: MiddlewareFn, allRoutes = false) {
    if (typeof base !== "string")
      throw new TypeError("[Oxarion] middleware: base must be a string");
    if (typeof middleware_fn !== "function")
      throw new TypeError(
        "[Oxarion] middleware: middleware_fn must be a function",
      );
    if (base[0] !== "/")
      throw new Error(
        `[Oxarion] middleware: base must start with "/", received: "${base}"`,
      );

    let i = this.routes.length;
    while (i--) {
      const route = this.routes[i];
      const path = route.path;
      if (!allRoutes && !path.startsWith(base)) continue;

      const current_handler = route.handler;
      route.handler = async (req, res) => {
        let handler_result: HandlerResult = undefined;
        await middleware_fn(req, res, async () => {
          handler_result = await current_handler(req, res);
          return handler_result;
        });
        return handler_result;
      };
    }
  }

  /**
   * Applies a chain of middleware functions to routes matching a base path.
   * @param base - The base path to match (must start with "/").
   * @param middlewares - An array of middleware functions to apply in order.
   * @param allRoutes - If true, applies to all routes; otherwise, only those starting with base.
   * @throws If base is not a string, does not start with "/", or middlewares is not an array of functions.
   */
  multiMiddleware(
    base: string,
    middlewares: MiddlewareFn[],
    allRoutes = false,
  ) {
    if (typeof base !== "string")
      throw new TypeError("[Oxarion] multiMiddleware: base must be a string");
    if (
      !Array.isArray(middlewares) ||
      !middlewares.every((fn) => typeof fn === "function")
    )
      throw new TypeError(
        "[Oxarion] multiMiddleware: middlewares must be an array of functions",
      );
    if (base[0] !== "/")
      throw new Error(
        `[Oxarion] multiMiddleware: base must start with "/", received: "${base}"`,
      );

    let i = this.routes.length;
    while (i--) {
      const route = this.routes[i];
      const path = route.path;
      if (!allRoutes && !path.startsWith(base)) continue;

      const current_handler = route.handler;
      route.handler = (req, res) =>
        compose_middleware(middlewares, current_handler)(req, res);
    }
  }

  /**
   * Creates a route group with shared base path and optional middleware chain.
   * @param base - The group base path (must start with "/").
   * @param callback - Receives a scoped router that auto-prefixes routes.
   * @param middlewares - Optional middleware chain applied to all group routes.
   */
  group(
    base: string,
    callback: (router: OxarionRouter) => void,
    middlewares: MiddlewareFn[] = [],
  ) {
    if (typeof base !== "string")
      throw new TypeError("[Oxarion] group: base must be a string");
    if (typeof callback !== "function")
      throw new TypeError("[Oxarion] group: callback must be a function");
    if (
      !Array.isArray(middlewares) ||
      !middlewares.every((fn) => typeof fn === "function")
    )
      throw new TypeError(
        "[Oxarion] group: middlewares must be an array of functions",
      );
    if (base[0] !== "/")
      throw new Error(
        `[Oxarion] group: base must start with "/", received: "${base}"`,
      );

    callback(this.create_group_router(this.clean_base_path(base), middlewares));
  }

  finalize_routes() {
    let n = this.routes.length;
    while (n > 1) {
      let new_n = 0;
      let i = 1;
      while (i < n) {
        const a = this.routes[i - 1];
        const b = this.routes[i];
        if (
          (!a.isStatic && b.isStatic) ||
          (a.isStatic === b.isStatic && a.segments.length < b.segments.length)
        ) {
          [this.routes[i - 1], this.routes[i]] = [b, a];
          new_n = i;
        }
        i++;
      }
      n = new_n;
    }
  }

  match(
    method: string,
    pathname: string,
  ): [Route, Record<string, string | string[]>] | null {
    const cache_key = `${method}:${pathname}`;

    const cached = this.match_cache.get(cache_key);
    if (cached) return cached;

    const static_route = this.static_routes.get(cache_key);
    if (static_route) {
      const result: [Route, Record<string, string>] = [static_route, {}];
      this.match_cache.set(cache_key, result);
      return result;
    }

    const url_segments: string[] = [];
    let i = 1,
      seg_start = 1;
    while (i <= pathname.length) {
      if (i === pathname.length || pathname[i] === "/") {
        if (i > seg_start) url_segments.push(pathname.slice(seg_start, i));
        seg_start = i + 1;
      }
      i++;
    }

    let r = 0;
    while (r < this.routes.length) {
      const route = this.routes[r++];

      const segs = route.segments;
      const has_catch_all = segs.some((s) => s.startsWith("[..."));

      if (!has_catch_all && segs.length !== url_segments.length) continue;
      if (route.method !== method) continue;

      const params: Record<string, string | string[]> = {};
      let matched = true;
      let seg_i = 0;
      let url_i = 0;

      while (seg_i < segs.length) {
        const seg = segs[seg_i++];
        if (seg[0] === "[") {
          if (seg.startsWith("[...")) {
            params[seg.slice(4, -1)] = url_segments.slice(url_i);
            break;
          } else params[seg.slice(1, -1)] = url_segments[url_i];
        } else if (seg !== url_segments[url_i]) {
          matched = false;
          break;
        }
        url_i++;
      }

      if (matched) {
        const result: [Route, Record<string, string | string[]>] = [
          route,
          params,
        ];
        this.match_cache.set(cache_key, result);
        return result;
      }
    }

    return null;
  }

  match_fast(method: string, url: string) {
    return this.match(method, parse_url_path(url));
  }

  dump_routes(): {
    method: Method;
    path: string;
    handler: Handler;
    openapi?: OpenApiRouteDefinition;
  }[] {
    let i = this.routes.length;
    const result = new Array(i);

    while (i--) {
      const r = this.routes[i];
      result[i] = {
        method: r.method,
        path: r.path,
        handler: r.handler,
        openapi: r.openapi,
      };
    }

    return result;
  }

  is_ws_route(path: string): boolean {
    return this.ws_routes.has(path);
  }

  has_route(method: Method, path: string): boolean {
    if (typeof path !== "string" || path[0] !== "/") return false;

    let i = this.routes.length;
    while (i--) {
      const route = this.routes[i];
      if (route.method !== method) continue;
      if (route.path === path) return true;
    }

    return false;
  }

  remove_route(method: Method, path: string): number {
    if (typeof path !== "string")
      throw new TypeError("[Oxarion] remove_route: path must be a string");
    if (path[0] !== "/")
      throw new Error(
        `[Oxarion] remove_route: path must start with '/', received: "${path}"`,
      );

    let removed = 0;
    let i = this.routes.length;

    while (i--) {
      const route = this.routes[i];
      if (route.method !== method) continue;
      if (route.path !== path) continue;

      this.routes.splice(i, 1);
      removed++;
    }

    if (removed) {
      this.static_routes.delete(`${method}:${path}`);
      this.match_cache.clear();
    }
    return removed;
  }

  cleanup() {
    this.match_cache.clear();
    this.static_routes.clear();
    this.routes.length = 0;
  }
}
