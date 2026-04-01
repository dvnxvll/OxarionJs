import { readdir } from "fs/promises";
import { dirname, extname, relative, resolve, sep } from "path";
import { pathToFileURL } from "url";
import type {
  DynamicRoutingOptions,
  DynamicRouteClass,
  DynamicRouteHandler,
  DynamicRouteModule,
  Method,
} from "../../../types";
import { Router } from "../route/router";

const DEFAULT_HANDLER_FILE = "api";
const DEFAULT_EXTENSIONS = ["ts", "js"];
const SUPPORTED_METHODS: Method[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

function normalize_extensions(extensions?: string[]): string[] {
  const source =
    Array.isArray(extensions) && extensions.length
      ? extensions
      : DEFAULT_EXTENSIONS;
  const result: string[] = [];
  let i = 0;

  while (i < source.length) {
    const ext = source[i];
    if (typeof ext !== "string") {
      i++;
      continue;
    }

    const normalized = ext.replace(/^\./, "").toLowerCase();
    if (normalized && !result.includes(normalized)) result.push(normalized);
    i++;
  }

  return result.length ? result : DEFAULT_EXTENSIONS;
}

function to_route_path(root_dir: string, file_path: string): string {
  const file_dir = dirname(file_path);
  const rel_dir = relative(root_dir, file_dir);
  if (!rel_dir || rel_dir === ".") return "/";

  const normalized = rel_dir.split(sep).join("/");
  return "/" + normalized;
}

function is_dynamic_handler_file(
  file_name: string,
  handler_file: string,
  extensions: string[],
): boolean {
  const dot = file_name.lastIndexOf(".");
  if (dot <= 0) return false;

  const base = file_name.slice(0, dot);
  const ext = file_name.slice(dot + 1).toLowerCase();
  return base === handler_file && extensions.includes(ext);
}

async function collect_dynamic_route_files(
  root_dir: string,
  handler_file: string,
  extensions: string[],
): Promise<string[]> {
  const files: string[] = [];
  const dirs: string[] = [root_dir];
  let i = 0;

  while (i < dirs.length) {
    const current_dir = dirs[i++];
    const entries = await readdir(current_dir, { withFileTypes: true });
    let e = 0;

    while (e < entries.length) {
      const entry = entries[e++];
      const full_path = resolve(current_dir, entry.name);

      if (entry.isDirectory()) {
        dirs.push(full_path);
        continue;
      }

      if (!entry.isFile()) continue;
      if (is_dynamic_handler_file(entry.name, handler_file, extensions))
        files.push(full_path);
    }
  }

  files.sort();
  return files;
}

async function import_dynamic_module(
  file_path: string,
): Promise<DynamicRouteModule> {
  const file_ext = extname(file_path).toLowerCase();
  const cache_key = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const module_url = `${pathToFileURL(file_path).href}?ext=${file_ext}&v=${cache_key}`;
  return await import(module_url);
}

function get_conflict_policy(
  on_conflict: DynamicRoutingOptions["onConflict"],
): "error" | "override" | "keepManual" {
  if (on_conflict === "error") return "error";
  if (on_conflict === "override") return "override";
  return "keepManual";
}

function has_supported_static_methods(
  target: unknown,
): target is DynamicRouteClass {
  if (typeof target !== "function") return false;

  let i = 0;
  while (i < SUPPORTED_METHODS.length) {
    const method = SUPPORTED_METHODS[i++] as Method;
    if (typeof (target as any)[method] === "function") return true;
  }

  return false;
}

function resolve_route_class(
  route_module: DynamicRouteModule,
): DynamicRouteClass | null {
  if (has_supported_static_methods(route_module.default))
    return route_module.default;

  const exports = Object.keys(route_module);
  let i = 0;

  while (i < exports.length) {
    const export_name = exports[i++];
    if (export_name === "default") continue;
    if (SUPPORTED_METHODS.includes(export_name as Method)) continue;

    const export_value = route_module[export_name];
    if (has_supported_static_methods(export_value)) return export_value;
  }

  return null;
}

function resolve_method_handler(
  route_module: DynamicRouteModule,
  route_class: DynamicRouteClass | null,
  method: Method,
): { handler: DynamicRouteHandler<any>; owner: unknown } | null {
  const direct_export = route_module[method];
  if (typeof direct_export === "function")
    return {
      handler: direct_export as DynamicRouteHandler<any>,
      owner: route_module,
    };

  if (!route_class) return null;

  const static_handler = route_class[method];
  if (typeof static_handler !== "function") return null;

  return {
    handler: static_handler as DynamicRouteHandler<any>,
    owner: route_class,
  };
}

export async function register_dynamic_routes(
  router: Router,
  options: DynamicRoutingOptions,
): Promise<number> {
  if (typeof options !== "object" || options === null)
    throw new TypeError("[Oxarion] dynamicRouting: options must be an object");
  if (typeof options.dir !== "string" || !options.dir.trim())
    throw new TypeError(
      "[Oxarion] dynamicRouting: dir must be a non-empty string",
    );

  const dynamic_dir = resolve(process.cwd(), options.dir);
  const handler_file =
    typeof options.handlerFile === "string" && options.handlerFile
      ? options.handlerFile
      : DEFAULT_HANDLER_FILE;
  const extensions = normalize_extensions(options.extensions);
  const conflict_policy = get_conflict_policy(options.onConflict);

  const route_files = await collect_dynamic_route_files(
    dynamic_dir,
    handler_file,
    extensions,
  );

  let registered_routes = 0;
  let f = 0;

  while (f < route_files.length) {
    const file_path = route_files[f++];
    const route_path = to_route_path(dynamic_dir, file_path);
    const route_module = await import_dynamic_module(file_path);
    const route_class = resolve_route_class(route_module);

    let found_method = false;
    let m = 0;

    while (m < SUPPORTED_METHODS.length) {
      const method = SUPPORTED_METHODS[m++];
      const resolved_method = resolve_method_handler(
        route_module,
        route_class,
        method,
      );

      if (!resolved_method) continue;
      const { handler: method_handler, owner: method_owner } = resolved_method;

      if (method_handler.length < 2)
        throw new Error(
          `[Oxarion] dynamicRouting: ${method} handler in "${file_path}" must have 2 params (req, res)`,
        );

      found_method = true;
      const has_conflict = router.has_route(method, route_path);

      if (has_conflict) {
        if (conflict_policy === "error")
          throw new Error(
            `[Oxarion] dynamicRouting conflict: ${method} ${route_path} already exists`,
          );
        if (conflict_policy === "keepManual") continue;
        router.remove_route(method, route_path);
      }

      router.addHandler(method, route_path as any, async (req, res) => {
        return (await method_handler.call(method_owner, req, res)) as any;
      });
      registered_routes++;
    }

    if (!found_method)
      console.warn(
        `[Oxarion] dynamicRouting: no supported method export or static class method found in "${file_path}"`,
      );
  }

  return registered_routes;
}
