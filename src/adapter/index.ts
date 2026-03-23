import type { ServerWebSocket } from "bun";
import { OxarionRequest } from "../handler/request";
import { OxarionResponse } from "../handler/response";
import { WSWatcher } from "../handler/ws";
import { Router } from "../route/router";
import type { OxarionOptions, WSContext } from "../types";
import { parse_url_path } from "../utils/parse_url";
import { check_update } from "../utils/check_update";
import { check_bun_version } from "../utils/version_check";
import { DynamicRouting } from "../dynamic_routing";

export class Oxarion {
  private static readonly DEFAULT_HOST = "127.0.0.1";
  private static server: ReturnType<typeof Bun.serve> | null = null;
  private static router: Router | null = null;
  private static not_found_res = new Response("Not Found", { status: 404 });
  private static server_error_res = new Response("Internal Server Error", {
    status: 500,
  });

  /**
   * Starts the Oxarion server with the given options.
   * @param options - Server and routing options
   * @returns The Bun server instance
   * @throws If Bun is not available
   */
  static async start(options: OxarionOptions) {
    if (typeof Bun === "undefined")
      throw new Error("[Oxarion] Please install BunJs");

    const {
      host,
      port,
      idleTimeout,
      ipv6Only,
      pagesDir,
      reusePort,
      unix,
      debugRoutes,
      cachePages,
      wsHandler,
      checkLatestVersion,
      notFoundHandler,
      errorHandler,
      dynamicRouting,
    } = options;

    Oxarion.router = new Router();
    options.httpHandler(Oxarion.router);
    if (dynamicRouting && dynamicRouting.enabled !== false)
      await DynamicRouting.register_dynamic_routes(
        Oxarion.router,
        dynamicRouting,
      );
    if (options.safeMwRegister) options.safeMwRegister(Oxarion.router);
    Oxarion.router.finalize_routes();

    const ws_watcher = !!wsHandler ? new WSWatcher() : undefined;
    if (ws_watcher) wsHandler!(ws_watcher);

    if (debugRoutes && Bun.env.NODE_ENV === "production")
      console.warn(
        "[Oxarion] Warning: debugRoutes is enabled in production. This will severely impact performance.",
      );

    const bun_ver = await check_bun_version();
    if (!bun_ver) return;

    if (checkLatestVersion !== false) await check_update();

    console.log(
      `[Oxarion] Server started on: http://${
        host || Oxarion.DEFAULT_HOST
      }:${port}`,
    );

    Oxarion.server = Bun.serve({
      port,
      hostname: host,
      idleTimeout,
      ipv6Only,
      reusePort,
      unix,

      fetch: async (req, server) => {
        let start = 0;
        let ox_req: OxarionRequest<Record<string, string | string[]>> | null =
          null;
        let ox_res: OxarionResponse | null = null;

        if (debugRoutes) start = performance.now();

        try {
          const url = req.url;
          const method = req.method;

          const path = parse_url_path(url);
          if (!!ws_watcher && Oxarion.router!.is_ws_route(path)) {
            const handler = ws_watcher.get_handler(path);
            if (!handler)
              return new Response("No WebSocket handler for this path", {
                status: 404,
              });

            const success = server.upgrade(req, { data: { handler } });
            if (success) return new Response(null, { status: 101 });
            return new Response("Upgrade failed", { status: 400 });
          }

          const match = Oxarion.router!.match_fast(method, url);
          if (!match) {
            if (notFoundHandler) {
              ox_req = new OxarionRequest(
                req,
                {} as Record<string, string | string[]>,
              );
              ox_res = new OxarionResponse(
                pagesDir || "pages",
                cachePages !== false,
                req,
              );
              const maybe_response = await notFoundHandler(ox_req, ox_res);
              const response =
                maybe_response instanceof Response
                  ? maybe_response
                  : ox_res.toResponse();

              if (debugRoutes) {
                const end = performance.now();
                const path = parse_url_path(url);
                console.log(
                  `${method} ${path} ${response.status} (${(
                    end - start
                  ).toFixed(2)}ms)`,
                );
              }

              return response;
            }

            if (debugRoutes) {
              const end = performance.now();
              const path = parse_url_path(url);
              console.log(
                `${method} ${path} 404 (${(end - start).toFixed(2)}ms)`,
              );
            }
            return Oxarion.not_found_res;
          }

          const [route, params] = match;
          ox_req = new OxarionRequest(req, params);
          ox_res = new OxarionResponse(
            pagesDir || "pages",
            cachePages !== false,
            req,
          );

          const maybe_response = await route.handler(ox_req, ox_res);
          const response =
            maybe_response instanceof Response
              ? maybe_response
              : ox_res.toResponse();

          if (debugRoutes) {
            const end = performance.now();
            const path = parse_url_path(url);
            console.log(
              `${method} ${path} ${response.status} (${(end - start).toFixed(
                2,
              )}ms)`,
            );
          }

          return response;
        } catch (err) {
          if (errorHandler) {
            try {
              const fallback_req =
                ox_req ||
                new OxarionRequest(
                  req,
                  {} as Record<string, string | string[]>,
                );
              const fallback_res =
                ox_res ||
                new OxarionResponse(
                  pagesDir || "pages",
                  cachePages !== false,
                  req,
                );

              const maybe_response = await errorHandler(
                err,
                fallback_req,
                fallback_res,
              );
              const response =
                maybe_response instanceof Response
                  ? maybe_response
                  : fallback_res.getBody() === null
                    ? fallback_res
                        .setStatus(500)
                        .send("Internal Server Error")
                        .toResponse()
                    : fallback_res.toResponse();

              if (debugRoutes) {
                const end = performance.now();
                const path = parse_url_path(req.url);
                console.log(
                  `${req.method} ${path} ${response.status} (${(
                    end - start
                  ).toFixed(2)}ms)`,
                );
              }

              return response;
            } catch (error_handler_err) {
              console.error("Error handler error:", error_handler_err);
              return Oxarion.server_error_res;
            }
          }

          console.error("Handler error:", err);
          return Oxarion.server_error_res;
        }
      },

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

      error(error) {
        console.error("Server error:", error);
      },
    });

    return Oxarion.server;
  }

  /**
   * Stops the Oxarion server and cleans up resources.
   */
  static async stop() {
    if (Oxarion.server) {
      Oxarion.server.stop();
      Oxarion.server = null;
    }
    if (Oxarion.router) {
      Oxarion.router.cleanup();
      Oxarion.router = null;
    }
  }
}
