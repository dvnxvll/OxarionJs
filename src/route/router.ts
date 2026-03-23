import type { OxarionRequest } from "../handler/request";
import type { OxarionResponse } from "../handler/response";
import type {
  Route,
  Method,
  ExtractRouteParams,
  Handler,
  HandlerResult,
  MiddlewareFn,
  OxarionRouter,
} from "../types";
import { symbl_get_routes, type RoutesWrapper } from "./wrapper";
import { compose_middleware } from "../utils/middleware";
import { parse_url_path } from "../utils/parse_url";

export class Router {
  private routes: Route[] = [];
  private route_cache = new Map<string, Route>();
  private ws_routes = new Map<string, boolean>();

  private route_path_from_segments(segments: string[]) {
    return "/" + segments.join("/");
  }

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

    const segments: string[] = [];
    const param_names: string[] = [];
    let is_static = true;
    let i = 1;
    let start = 1;

    while (i <= path.length) {
      if (i === path.length || path[i] === "/") {
        if (i > start) {
          const segment = path.slice(start, i);
          segments.push(segment);
          if (segment[0] === "[") {
            is_static = false;
            const is_catch_all = segment.startsWith("[...");
            param_names.push(
              is_catch_all ? segment.slice(4, -1) : segment.slice(1, -1),
            );
          }
        }
        start = i + 1;
      }
      i++;
    }

    const route: Route = {
      method,
      handler: handler as Handler,
      segments,
      paramNames: param_names,
      isStatic: is_static,
    };

    this.routes.push(route);

    if (is_static) {
      this.route_cache.set(`${method}:${path}`, route);
    }
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
      const path = this.route_path_from_segments(route.segments);
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
      const path = this.route_path_from_segments(route.segments);
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
    const cached = this.route_cache.get(cache_key);
    if (cached) return [cached, {}];

    const url_segments: string[] = [];
    let i = 1,
      seg_start = 1;
    while (i <= pathname.length) {
      if (i === pathname.length || pathname[i] === "/") {
        if (i > seg_start) {
          url_segments.push(pathname.slice(seg_start, i));
        }
        seg_start = i + 1;
      }
      i++;
    }

    let r = 0;
    while (r < this.routes.length) {
      const route = this.routes[r++];
      if (route.method !== method) continue;

      const params: Record<string, string | string[]> = {};
      const segs = route.segments;
      const has_catch_all = segs.some((s) => s.startsWith("[..."));

      if (!has_catch_all && segs.length !== url_segments.length) continue;

      let matched = true;
      let seg_i = 0;
      let url_i = 0;

      while (seg_i < segs.length) {
        const seg = segs[seg_i++];
        if (seg[0] === "[") {
          if (seg.startsWith("[...")) {
            params[seg.slice(4, -1)] = url_segments.slice(url_i);
            break;
          } else {
            params[seg.slice(1, -1)] = url_segments[url_i];
          }
        } else if (seg !== url_segments[url_i]) {
          matched = false;
          break;
        }
        url_i++;
      }

      if (matched) return [route, params];
    }

    return null;
  }

  match_fast(method: string, url: string) {
    return this.match(method, parse_url_path(url));
  }

  dump_routes(): { method: Method; path: string; handler: Handler }[] {
    let i = this.routes.length;
    const result = new Array(i);

    while (i--) {
      const r = this.routes[i];
      result[i] = {
        method: r.method,
        path: this.route_path_from_segments(r.segments),
        handler: r.handler,
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
      if (this.route_path_from_segments(route.segments) === path) return true;
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
      if (this.route_path_from_segments(route.segments) !== path) continue;

      this.routes.splice(i, 1);
      removed++;
    }

    if (removed) this.route_cache.delete(`${method}:${path}`);
    return removed;
  }

  cleanup() {
    this.route_cache.clear();
    this.routes.length = 0;
  }
}
