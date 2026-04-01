import type {
  OxarionApp,
  OxarionCreateOptions,
  OxarionOptions,
} from "../types";
import { OxarionAppImpl } from "./app";

export class Oxarion {
  private static app: OxarionAppImpl | null = null;

  static create(options: OxarionCreateOptions): OxarionApp {
    return new OxarionAppImpl(options);
  }

  static async start(options: OxarionOptions) {
    const app = new OxarionAppImpl(options);
    Oxarion.app = app;
    return await app.start(options);
  }

  static async stop() {
    if (!Oxarion.app) return;
    await Oxarion.app.stop();
    Oxarion.app = null;
  }
}
