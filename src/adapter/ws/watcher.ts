import type { WSHandler } from "../../types";

export class WSWatcher {
  private routes: Map<string, WSHandler> = new Map();

  /**
   * Registers a WebSocket handler for a given path.
   * @param {string} path - The WebSocket route path.
   * @param {WSHandler} handler - The handler function for the path.
   * @throws If arguments are of incorrect type.
   */
  path(path: string, handler: WSHandler) {
    if (typeof path !== "string")
      throw new TypeError("[Oxarion] path: path must be a string");
    if (typeof handler !== "object")
      throw new TypeError("[Oxarion] path: handler must be a object");

    this.routes.set(path, handler);
  }

  get_handler(path: string) {
    return this.routes.get(path);
  }
}
