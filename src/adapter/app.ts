import type { ServerWebSocket } from "bun";
import { register_dynamic_routes } from "./http/dynamic_routing";
import { OxarionRequest } from "./http/request";
import { OxarionResponse } from "./http/response";
import { Router } from "./http/route/router";
import { TemplateEngine, type RenderData } from "./http/template";
import { parse_url_path } from "../utils/parse_url";
import { check_update } from "../utils/check_update";
import { check_bun_version } from "../utils/version_check";
import type {
  AppRequestInit,
  HandlerResult,
  OxarionApp,
  OxarionCreateOptions,
  OxarionListenOptions,
  Route,
  WSContext,
} from "../types";
import { WSWatcher } from "./ws/watcher";

class OxarionAppImpl implements OxarionApp {
  private static readonly DEFAULT_HOST = "127.0.0.1";
  private readonly options: OxarionCreateOptions;
  private readonly router = new Router();
  private readonly template_engine: TemplateEngine | null;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private ws_watcher: WSWatcher | null = null;
  private setup_done = false;
  private version_checked = false;
  private update_checked = false;
  private readonly not_found_res = new Response("Not Found", { status: 404 });
  private readonly server_error_res = new Response("Internal Server Error", {
    status: 500,
  });

  constructor(options: OxarionCreateOptions) {
    this.options = options;
    this.template_engine =
      options.template?.enabled === false
        ? null
        : new TemplateEngine({
            pagesDir: options.template?.pagesDir || options.pagesDir,
            fragmentsDir: options.template?.fragmentsDir,
            layoutsDir: options.template?.layoutsDir,
            cache:
              options.template?.cache === undefined
                ? true
                : options.template.cache,
            autoEscape: options.template?.autoEscape,
            extension: options.template?.extension,
          });
  }

  private get_template_engine(): TemplateEngine {
    if (!this.template_engine)
      throw new Error(
        "[Oxarion] template rendering is disabled. Enable it with the template option.",
      );
    return this.template_engine;
  }

  private async setup_router() {
    if (this.setup_done) return;

    this.options.httpHandler(this.router);
    await this.router.await_pending_tasks();

    const dynamic_routing = this.options.dynamicRouting;
    if (dynamic_routing && dynamic_routing.enabled !== false)
      await register_dynamic_routes(this.router, dynamic_routing);

    if (this.options.safeMwRegister) this.options.safeMwRegister(this.router);
    await this.router.await_pending_tasks();
    this.router.finalize_routes();

    if (this.options.wsHandler) {
      this.ws_watcher = new WSWatcher();
      this.options.wsHandler(this.ws_watcher);
    }

    this.setup_done = true;
  }

  private async ensure_runtime_checks() {
    if (!this.version_checked) {
      const bun_ver = await check_bun_version();
      this.version_checked = true;
      if (!bun_ver) throw new Error("[Oxarion] Unsupported Bun version");
    }

    if (this.options.checkLatestVersion !== false && !this.update_checked) {
      this.update_checked = true;
      await check_update();
    }
  }

  private async run_hooks(
    hooks: Array<(...args: any[]) => void | Promise<void>> | undefined,
    cb: (hook: (...args: any[]) => void | Promise<void>) => Promise<void>,
  ) {
    if (!hooks || !hooks.length) return;
    let i = 0;
    while (i < hooks.length) await cb(hooks[i++] as never);
  }

  private async finalize_handler_result(
    route: Route,
    req: OxarionRequest<Record<string, string | string[]>>,
    res: OxarionResponse,
    maybe_response: HandlerResult,
  ): Promise<Response> {
    if (maybe_response instanceof Response) {
      const response = maybe_response;
      await this.run_hooks(route.scope?.hooks.onResponse, async (hook) => {
        await hook(req as any, response);
      });
      return response;
    }

    const target_res =
      maybe_response instanceof OxarionResponse ? maybe_response : res;

    await this.run_hooks(route.scope?.hooks.onSend, async (hook) => {
      await hook(req as any, target_res);
    });

    const response = target_res.toResponse();
    await this.run_hooks(route.scope?.hooks.onResponse, async (hook) => {
      await hook(req as any, response);
    });
    return response;
  }

  private build_request(input: string | AppRequestInit): Request {
    if (typeof input === "string") {
      const url =
        input.startsWith("http://") || input.startsWith("https://")
          ? input
          : `http://127.0.0.1${input}`;
      return new Request(url);
    }

    const method = input.method || "GET";
    const path = input.path;
    const url =
      path.startsWith("http://") || path.startsWith("https://")
        ? path
        : `http://127.0.0.1${path}`;
    return new Request(url, {
      method,
      headers: input.headers,
      body: input.body,
    });
  }

  private async execute_request(
    req: Request,
    server?: ReturnType<typeof Bun.serve>,
  ): Promise<Response> {
    const { pagesDir, cachePages, debugRoutes, notFoundHandler, errorHandler } =
      this.options;

    let start = 0;
    let path = "";
    let ox_req: OxarionRequest<Record<string, string | string[]>> | null = null;
    let ox_res: OxarionResponse | null = null;

    if (debugRoutes) start = performance.now();

    try {
      const url = req.url;
      const method = req.method;

      path = parse_url_path(url);
      if (this.ws_watcher && this.router.is_ws_route(path)) {
        const handler = this.ws_watcher.get_handler(path);
        if (!handler)
          return new Response("No WebSocket handler for this path", {
            status: 404,
          });

        if (!server)
          return new Response("Upgrade requires a running server", {
            status: 400,
          });

        const success = server.upgrade(req, { data: { handler } });
        if (success) return new Response(null, { status: 101 });
        return new Response("Upgrade failed", { status: 400 });
      }

      const match = this.router.match(method, path);
      if (!match) {
        if (notFoundHandler) {
          ox_req = new OxarionRequest(
            req,
            {},
            this.router.get_service_container(),
          );
          ox_res = new OxarionResponse(
            pagesDir || "pages",
            cachePages !== false,
            req,
            this.template_engine,
          );
          const maybe_response = await notFoundHandler(ox_req, ox_res);
          const response =
            maybe_response instanceof Response
              ? maybe_response
              : maybe_response instanceof OxarionResponse
                ? maybe_response.toResponse()
                : ox_res.toResponse();

          if (debugRoutes) {
            const end = performance.now();
            console.log(
              `${method} ${path} ${response.status} (${(end - start).toFixed(2)}ms)`,
            );
          }
          return response;
        }

        if (debugRoutes) {
          const end = performance.now();
          console.log(`${method} ${path} 404 (${(end - start).toFixed(2)}ms)`);
        }
        return this.not_found_res;
      }

      const [route, params] = match;
      ox_req = new OxarionRequest(
        req,
        params,
        route.scope?.services || this.router.get_service_container(),
      );
      ox_res = new OxarionResponse(
        pagesDir || "pages",
        cachePages !== false,
        req,
        this.template_engine,
      );

      await this.run_hooks(route.scope?.hooks.onRequest, async (hook) => {
        await hook(ox_req as any, ox_res as any);
      });
      await this.run_hooks(route.scope?.hooks.preHandler, async (hook) => {
        await hook(ox_req as any, ox_res as any);
      });

      const maybe_response = await route.handler(ox_req, ox_res);
      const response = await this.finalize_handler_result(
        route,
        ox_req,
        ox_res,
        maybe_response,
      );

      if (debugRoutes) {
        const end = performance.now();
        console.log(
          `${method} ${path} ${response.status} (${(end - start).toFixed(2)}ms)`,
        );
      }

      return response;
    } catch (err) {
      if (ox_req && ox_res) {
        const match = this.router.match(req.method, path);
        const route = match?.[0];
        if (route?.scope?.hooks.onError.length) {
          try {
            await this.run_hooks(route.scope.hooks.onError, async (hook) => {
              await hook(err, ox_req as any, ox_res as any);
            });
            if (ox_res.getBody() !== null) {
              const response = await this.finalize_handler_result(
                route,
                ox_req,
                ox_res,
                ox_res,
              );
              if (debugRoutes) {
                const end = performance.now();
                console.log(
                  `${req.method} ${path} ${response.status} (${(end - start).toFixed(2)}ms)`,
                );
              }
              return response;
            }
          } catch (hook_error) {
            err = hook_error;
          }
        }
      }

      if (errorHandler) {
        try {
          const fallback_req =
            ox_req ||
            new OxarionRequest(req, {}, this.router.get_service_container());
          const fallback_res =
            ox_res ||
            new OxarionResponse(
              pagesDir || "pages",
              cachePages !== false,
              req,
              this.template_engine,
            );

          const maybe_response = await errorHandler(
            err,
            fallback_req,
            fallback_res,
          );
          const response =
            maybe_response instanceof Response
              ? maybe_response
              : maybe_response instanceof OxarionResponse
                ? maybe_response.toResponse()
                : fallback_res.getBody() === null
                  ? fallback_res
                      .setStatus(500)
                      .send("Internal Server Error")
                      .toResponse()
                  : fallback_res.toResponse();

          if (debugRoutes) {
            const end = performance.now();
            console.log(
              `${req.method} ${path} ${response.status} (${(end - start).toFixed(2)}ms)`,
            );
          }

          return response;
        } catch (error_handler_err) {
          console.error("Error handler error:", error_handler_err);
          return this.server_error_res;
        }
      }

      console.error("Handler error:", err);
      return this.server_error_res;
    }
  }

  async start(options: OxarionListenOptions = {}) {
    if (typeof Bun === "undefined")
      throw new Error("[Oxarion] Please install BunJs");

    await this.setup_router();
    await this.ensure_runtime_checks();

    const host = options.host || OxarionAppImpl.DEFAULT_HOST;
    const port = options.port;

    if (this.options.debugRoutes && Bun.env.NODE_ENV === "production")
      console.warn(
        "[Oxarion] Warning: debugRoutes is enabled in production. This will severely impact performance.",
      );

    console.log(`[Oxarion] Server started on: http://${host}:${port}`);

    this.server = Bun.serve({
      port,
      hostname: options.host,
      idleTimeout: options.idleTimeout,
      ipv6Only: options.ipv6Only,
      reusePort: options.reusePort,
      unix: options.unix,
      fetch: (req: Request, server: ReturnType<typeof Bun.serve>) =>
        this.execute_request(req, server),
      websocket: {
        open(ws: ServerWebSocket<WSContext>) {
          ws.data?.handler?.onOpen?.(ws);
        },
        message(ws: ServerWebSocket<WSContext>, message: string | Uint8Array) {
          ws.data?.handler?.onMessage?.(ws, message);
        },
        close(ws: ServerWebSocket<WSContext>, code: number, reason: string) {
          ws.data?.handler?.onClose?.(ws, code, reason);
        },
        drain(ws: ServerWebSocket<WSContext>) {
          ws.data?.handler?.onDrain?.(ws);
        },
      },
      error(error: Error) {
        console.error("Server error:", error);
      },
    } as any);

    return this.server;
  }

  async stop() {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    this.router.cleanup();
  }

  async request(input: string | AppRequestInit): Promise<Response> {
    await this.setup_router();
    const req = this.build_request(input);
    return await this.execute_request(req);
  }

  async render(
    page: string,
    data: RenderData = {},
  ): Promise<string> {
    return await this.get_template_engine().render_page(page, data);
  }

  async renderFragment(
    fragment: string,
    data: RenderData = {},
  ): Promise<string> {
    return await this.get_template_engine().render_fragment(fragment, data);
  }

  getRouter() {
    return this.router;
  }
}

export { OxarionAppImpl };
