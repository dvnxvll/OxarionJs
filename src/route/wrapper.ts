import type {
  Method,
  Handler,
  OxarionRouter,
  OpenApiRouteDefinition,
} from "../types";
import { Router } from "./router";

export const symbl_get_routes = Symbol("_getRoutes");

export class RoutesWrapper {
  private readonly router = new Router();

  /**
   * Injects routes into the internal router using the provided callback.
   * @param {function(OxarionRouter): void} callback - A function that receives the router instance.
   * @returns {this} The current RoutesWrapper instance.
   * @throws {TypeError} If callback is not a function.
   */
  inject(callback: (router: OxarionRouter) => void): this {
    if (typeof callback !== "function")
      throw new TypeError("[Oxarion] inject: callback must be a function");
    callback(this.router);
    return this;
  }

  [symbl_get_routes](): {
    method: Method;
    path: string;
    handler: Handler;
    openapi?: OpenApiRouteDefinition;
  }[] {
    return this.router.dump_routes();
  }
}
