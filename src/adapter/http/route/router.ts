import type { OxarionRequest } from "../request";
import type {
  ExtractRouteParams,
  Handler,
  HandlerResult,
  HookMap,
  HookName,
  Method,
  MiddlewareFn,
  OpenApiRouteDefinition,
  OxarionRouter,
  Route,
  RouteHooks,
  ServiceContainer,
  ServiceMap,
  ServeOpenApiOptions,
  ServeStaticOptions,
} from "../../../types";
import { symbl_get_routes, type RoutesWrapper } from "./wrapper";
import { ox_runtime_js, ox_runtime_path } from "../dynamic_html";
import { OxarionResponse } from "../response";
import { generate_openapi_spec } from "../openapi/generate_openapi";
import { create_service_container, service_has } from "../service/container";
import { compose_middleware } from "../../../utils/middleware";
import { parse_url_path } from "../../../utils/parse_url";
import { SimpleLRU } from "../../../utils/simple_lru";
import { extname, resolve, sep } from "path";

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

type RouterShared = {
  routes: Route[];
  static_routes: Map<string, Route>;
  match_cache: SimpleLRU<string, [Route, Record<string, string | string[]>]>;
  ws_routes: Map<string, boolean>;
  pending_tasks: Promise<unknown>[];
  ox_runtime_registered: boolean;
};

type RouterScope<TServices extends ServiceMap = ServiceMap> = {
  base_path: string;
  middlewares: MiddlewareFn[];
  services: ServiceContainer;
  hooks: RouteHooks<TServices>;
};

const create_route_hooks = <TServices extends ServiceMap>(
  parent?: RouteHooks<any>,
): RouteHooks<TServices> => ({
  onRequest: parent ? parent.onRequest.slice() : [],
  preHandler: parent ? parent.preHandler.slice() : [],
  onSend: parent ? parent.onSend.slice() : [],
  onResponse: parent ? parent.onResponse.slice() : [],
  onError: parent ? parent.onError.slice() : [],
});

const create_shared = (): RouterShared => ({
  routes: [],
  static_routes: new Map<string, Route>(),
  match_cache: new SimpleLRU<
    string,
    [Route, Record<string, string | string[]>]
  >(1000),
  ws_routes: new Map<string, boolean>(),
  pending_tasks: [],
  ox_runtime_registered: false,
});

let warned_inject_wrapper_deprecated = false;

export class Router<
  TServices extends ServiceMap = ServiceMap,
> implements OxarionRouter<TServices> {
  private readonly shared: RouterShared;
  private readonly scope: RouterScope<TServices>;

  constructor(shared?: RouterShared, scope?: RouterScope<TServices>) {
    this.shared = shared || create_shared();
    this.scope =
      scope ||
      ({
        base_path: "",
        middlewares: [],
        services: create_service_container(),
        hooks: create_route_hooks<TServices>(),
      } as RouterScope<TServices>);
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

  private current_base(): string {
    return this.scope.base_path || "/";
  }

  private resolve_path(path: string): string {
    if (!this.scope.base_path) return path;
    return this.join_paths(this.current_base(), path);
  }

  private create_child_router<TChildServices extends ServiceMap = TServices>(
    base_path: string,
    middlewares: MiddlewareFn[],
    services: ServiceContainer,
    hooks: RouteHooks<TChildServices>,
  ): Router<TChildServices> {
    return new Router<TChildServices>(this.shared, {
      base_path,
      middlewares,
      services,
      hooks,
    });
  }

  private wrap_handler_with_middleware(
    handler: Handler,
    middlewares: MiddlewareFn[],
  ): Handler {
    if (!middlewares.length) return handler;
    return (req, res) => compose_middleware(middlewares, handler)(req, res);
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

  private add_route(route: Route) {
    this.shared.routes.push(route);
    if (route.isStatic)
      this.shared.static_routes.set(`${route.method}:${route.path}`, route);
    this.shared.match_cache.clear();
  }

  private clone_route(route: Route, path: string): Route {
    const { segments, paramNames, isStatic } = this.parse_path_segments(path);
    return {
      method: route.method,
      handler: route.handler,
      segments,
      paramNames,
      isStatic,
      path,
      openapi: route.openapi,
      scope: route.scope,
    };
  }

  private mount_wrapper(base: string, wrapper: RoutesWrapper) {
    const base_clean = base.replace(/\/$/, "") || "/";
    const routes = wrapper[symbl_get_routes]();

    let i = routes.length;
    while (i--) {
      const route = routes[i];
      const path =
        base_clean === "/"
          ? route.path
          : `${base_clean}/${route.path.replace(/^\//, "")}`;
      this.add_route(this.clone_route(route, path));
    }
  }

  get_service_container(): ServiceContainer {
    return this.scope.services;
  }

  async await_pending_tasks() {
    let i = 0;
    while (i < this.shared.pending_tasks.length)
      await this.shared.pending_tasks[i++];
  }

  addHandler<Path extends string>(
    method: Method,
    path: Path,
    handler: (
      req: OxarionRequest<ExtractRouteParams<Path>, TServices>,
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

    const full_path = this.resolve_path(path);
    const { segments, paramNames, isStatic } =
      this.parse_path_segments(full_path);

    this.add_route({
      method,
      handler: this.wrap_handler_with_middleware(
        handler as Handler,
        this.scope.middlewares,
      ),
      segments,
      paramNames,
      isStatic,
      path: full_path,
      scope: this.scope,
    });
  }

  addHandlerOpenApi<Path extends string>(
    method: Method,
    path: Path,
    handler: (
      req: OxarionRequest<ExtractRouteParams<Path>, TServices>,
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

    const full_path = this.resolve_path(path);
    const { segments, paramNames, isStatic } =
      this.parse_path_segments(full_path);

    this.add_route({
      method,
      handler: this.wrap_handler_with_middleware(
        handler as Handler,
        this.scope.middlewares,
      ),
      segments,
      paramNames,
      isStatic,
      path: full_path,
      openapi,
      scope: this.scope,
    });
  }

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

    if (!warned_inject_wrapper_deprecated) {
      warned_inject_wrapper_deprecated = true;
      console.warn(
        "[Oxarion] router.injectWrapper() is deprecated and will be removed in 1.5.x; use router.mount() instead",
      );
    }
    this.mount_wrapper(base, wrapper);
  }

  mount(base: string, wrapper: RoutesWrapper) {
    if (typeof base !== "string")
      throw new TypeError("[Oxarion] mount: base must be a string");
    if (
      typeof wrapper !== "object" ||
      wrapper === null ||
      typeof wrapper[symbl_get_routes] !== "function"
    )
      throw new TypeError("[Oxarion] mount: wrapper must be a RoutesWrapper");

    this.mount_wrapper(base, wrapper);
  }

  register<TOptions = void>(
    plugin: (
      router: OxarionRouter<TServices>,
      options: TOptions,
    ) => void | Promise<void>,
    ...args: TOptions extends void ? [] : [options: TOptions]
  ) {
    if (typeof plugin !== "function")
      throw new TypeError("[Oxarion] register: plugin must be a function");

    const child = this.create_child_router<TServices>(
      this.scope.base_path,
      this.scope.middlewares,
      create_service_container(this.scope.services),
      create_route_hooks<TServices>(this.scope.hooks),
    );

    const maybe_promise = plugin(child, args[0] as TOptions);
    if (
      maybe_promise &&
      typeof (maybe_promise as Promise<void>).then === "function"
    )
      this.shared.pending_tasks.push(maybe_promise as Promise<void>);
    return this;
  }

  hook<TName extends HookName>(name: TName, fn: HookMap<TServices>[TName]) {
    if (
      name !== "onRequest" &&
      name !== "preHandler" &&
      name !== "onSend" &&
      name !== "onResponse" &&
      name !== "onError"
    )
      throw new TypeError(
        `[Oxarion] hook: unsupported hook name: ${String(name)}`,
      );
    if (typeof fn !== "function")
      throw new TypeError("[Oxarion] hook: fn must be a function");

    this.scope.hooks[name].push(fn as never);
    return this;
  }

  provide<TKey extends string, TValue>(name: TKey, value: TValue) {
    if (typeof name !== "string" || !name)
      throw new TypeError("[Oxarion] provide: name must be a non-empty string");

    this.scope.services.values.set(name, value);
    return this as unknown as Router<TServices & Record<TKey, TValue>>;
  }

  hasService(name: string): boolean {
    return service_has(this.scope.services, name);
  }

  switchToWs(path: string) {
    if (typeof path !== "string")
      throw new TypeError("[Oxarion] switchToWs: path must be a string");
    if (path[0] !== "/")
      throw new Error(
        `[Oxarion] switchToWs: path must start with '/', received: "${path}"`,
      );

    this.shared.ws_routes.set(this.resolve_path(path), true);
  }

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

    const full_prefix = this.resolve_path(prefix);
    const normalized_prefix =
      full_prefix === "/" ? "/" : full_prefix.replace(/\/+$/, "");
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

    this.addHandler("GET", index_route as any, async (_req, res) => {
      await serve_handler(_req as OxarionRequest<any>, res);
    });
    this.addHandler("HEAD", index_route as any, async (_req, res) => {
      await serve_handler(_req as OxarionRequest<any>, res);
    });
    this.addHandler("GET", catch_all_route as any, serve_handler as any);
    this.addHandler("HEAD", catch_all_route as any, serve_handler as any);
  }

  serveOx() {
    if (this.shared.ox_runtime_registered) return ox_runtime_path;
    this.shared.ox_runtime_registered = true;

    this.addHandler("GET", "/__oxarion/ox.js", (_req, res) => {
      return res
        .setHeader("Content-Type", "application/javascript; charset=utf-8")
        .setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate")
        .send(ox_runtime_js);
    });
    this.addHandler("GET", ox_runtime_path as any, (_req, res) => {
      return res
        .setHeader("Content-Type", "application/javascript; charset=utf-8")
        .setHeader("Cache-Control", "public, max-age=31536000, immutable")
        .send(ox_runtime_js);
    });
    return ox_runtime_path;
  }

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

    const full_path = this.resolve_path(spec_path);
    const exclude_endpoint = options.excludeEndpointFromSpec ?? true;
    let cached_spec: Record<string, unknown> | null = null;

    this.addHandler("GET", full_path as any, async () => {
      if (!cached_spec) {
        const routes = this.dump_routes().filter((r) => {
          if (!exclude_endpoint) return true;
          return r.path !== full_path;
        });

        cached_spec = generate_openapi_spec(routes, {
          info: options.info,
          servers: options.servers,
        });
      }

      return OxarionResponse.json(cached_spec);
    });
  }

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

    const full_base = allRoutes ? "/" : this.resolve_path(base);
    let i = this.shared.routes.length;
    while (i--) {
      const route = this.shared.routes[i];
      const path = route.path;
      if (!allRoutes && !path.startsWith(full_base)) continue;

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

    const full_base = allRoutes ? "/" : this.resolve_path(base);
    let i = this.shared.routes.length;
    while (i--) {
      const route = this.shared.routes[i];
      const path = route.path;
      if (!allRoutes && !path.startsWith(full_base)) continue;

      const current_handler = route.handler;
      route.handler = (req, res) =>
        compose_middleware(middlewares, current_handler)(req, res);
    }
  }

  group(
    base: string,
    callback: (router: OxarionRouter<TServices>) => void,
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

    const full_base = this.join_paths(
      this.current_base(),
      this.clean_base_path(base),
    );
    const full_chain =
      this.scope.middlewares.length && middlewares.length
        ? this.scope.middlewares.concat(middlewares)
        : this.scope.middlewares.length
          ? this.scope.middlewares.slice()
          : middlewares.slice();

    callback(
      this.create_child_router<TServices>(
        full_base,
        full_chain,
        create_service_container(this.scope.services),
        create_route_hooks<TServices>(this.scope.hooks),
      ),
    );
  }

  finalize_routes() {
    let n = this.shared.routes.length;
    while (n > 1) {
      let new_n = 0;
      let i = 1;
      while (i < n) {
        const a = this.shared.routes[i - 1];
        const b = this.shared.routes[i];
        if (
          (!a.isStatic && b.isStatic) ||
          (a.isStatic === b.isStatic && a.segments.length < b.segments.length)
        ) {
          [this.shared.routes[i - 1], this.shared.routes[i]] = [b, a];
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
    const cached = this.shared.match_cache.get(cache_key);
    if (cached) return cached;

    const static_route = this.shared.static_routes.get(cache_key);
    if (static_route) {
      const result: [Route, Record<string, string>] = [static_route, {}];
      this.shared.match_cache.set(cache_key, result);
      return result;
    }

    const url_segments: string[] = [];
    let i = 1;
    let seg_start = 1;
    while (i <= pathname.length) {
      if (i === pathname.length || pathname[i] === "/") {
        if (i > seg_start) url_segments.push(pathname.slice(seg_start, i));
        seg_start = i + 1;
      }
      i++;
    }

    let r = 0;
    while (r < this.shared.routes.length) {
      const route = this.shared.routes[r++];
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
          }
          params[seg.slice(1, -1)] = url_segments[url_i];
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
        this.shared.match_cache.set(cache_key, result);
        return result;
      }
    }

    return null;
  }

  match_fast(method: string, url: string) {
    return this.match(method, parse_url_path(url));
  }

  dump_routes(): Route[] {
    let i = this.shared.routes.length;
    const result = new Array<Route>(i);
    while (i--) result[i] = this.shared.routes[i];
    return result;
  }

  is_ws_route(path: string): boolean {
    return this.shared.ws_routes.has(path);
  }

  has_route(method: Method, path: string): boolean {
    if (typeof path !== "string" || path[0] !== "/") return false;

    let i = this.shared.routes.length;
    while (i--) {
      const route = this.shared.routes[i];
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
    let i = this.shared.routes.length;
    while (i--) {
      const route = this.shared.routes[i];
      if (route.method !== method) continue;
      if (route.path !== path) continue;
      this.shared.routes.splice(i, 1);
      removed++;
    }

    if (removed) {
      this.shared.static_routes.delete(`${method}:${path}`);
      this.shared.match_cache.clear();
    }
    return removed;
  }

  cleanup() {
    this.shared.match_cache.clear();
    this.shared.static_routes.clear();
    this.shared.ws_routes.clear();
    this.shared.routes.length = 0;
    this.shared.pending_tasks.length = 0;
  }
}
