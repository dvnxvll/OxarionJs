import { readFile } from "fs/promises";
import { extname, resolve, sep } from "path";
import { escape_html } from "./escape";
import type {
  CompiledTemplate,
  RenderData,
  TemplateKind,
  TemplateOptions,
} from "./types";

const DEFAULT_EXTENSION = ".html";
const DEFAULT_FRAGMENTS_DIR = "fragments";
const DEFAULT_LAYOUTS_DIR = "layouts";
const DEFAULT_PAGES_DIR = "pages";
const BINDING_PREFIX = "{ox.";

const template_value_to_string = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  )
    return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const compile_template = (source: string): CompiledTemplate => {
  const static_parts: string[] = [];
  const getters: Array<{ path: string[] }> = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf(BINDING_PREFIX, cursor);
    if (start === -1) break;

    const end = source.indexOf("}", start + BINDING_PREFIX.length);
    if (end === -1) break;

    const expr = source.slice(start + 1, end).trim();
    if (!expr.startsWith("ox.")) {
      cursor = start + 1;
      continue;
    }

    const path = expr.split(".");
    if (path.length < 2) {
      cursor = start + 1;
      continue;
    }
    let valid = true;
    let i = 0;

    while (i < path.length) {
      const segment = path[i++];
      if (!segment || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment)) {
        valid = false;
        break;
      }
    }

    if (!valid) {
      cursor = start + 1;
      continue;
    }

    static_parts.push(source.slice(cursor, start));
    getters.push({ path });
    cursor = end + 1;
  }

  static_parts.push(source.slice(cursor));
  return { static_parts, getters };
};

const render_compiled_template = (
  compiled: CompiledTemplate,
  data: RenderData,
  auto_escape: boolean,
): string => {
  const getters = compiled.getters;
  if (!getters.length) return compiled.static_parts[0] || "";

  let result = compiled.static_parts[0] || "";
  let i = 0;

  while (i < getters.length) {
    const getter = getters[i];
    const path = getter.path;
    let current: unknown = data;
    let p = 0;

    while (p < path.length) {
      if (current === null || current === undefined) {
        current = "";
        break;
      }
      current = (current as Record<string, unknown>)[path[p++]];
    }

    const value = template_value_to_string(current);
    result += auto_escape ? escape_html(value) : value;
    result += compiled.static_parts[i + 1] || "";
    i++;
  }

  return result;
};

export class TemplateEngine {
  private readonly cache_enabled: boolean;
  private readonly auto_escape: boolean;
  private readonly extension: string;
  private readonly pages_root: string;
  private readonly fragments_root: string;
  private readonly layouts_root: string;
  private readonly compiled_cache = new Map<string, CompiledTemplate>();

  constructor(options: TemplateOptions = {}) {
    this.cache_enabled = options.cache !== false;
    this.auto_escape = options.autoEscape !== false;
    this.extension =
      typeof options.extension === "string" && options.extension
        ? options.extension.startsWith(".")
          ? options.extension
          : `.${options.extension}`
        : DEFAULT_EXTENSION;
    this.pages_root = resolve(
      process.cwd(),
      options.pagesDir || DEFAULT_PAGES_DIR,
    );
    this.fragments_root = resolve(
      process.cwd(),
      options.fragmentsDir || DEFAULT_FRAGMENTS_DIR,
    );
    this.layouts_root = resolve(
      process.cwd(),
      options.layoutsDir || DEFAULT_LAYOUTS_DIR,
    );
  }

  private root_for(kind: TemplateKind): string {
    if (kind === "fragment") return this.fragments_root;
    return this.pages_root;
  }

  private resolve_template_path(kind: TemplateKind, file_path: string): string {
    if (typeof file_path !== "string" || !file_path.trim())
      throw new TypeError(
        `[Oxarion] render${kind === "fragment" ? "Fragment" : ""}: file path must be a non-empty string`,
      );

    const root = this.root_for(kind);
    const normalized =
      extname(file_path) === "" ? `${file_path}${this.extension}` : file_path;
    const full_path = resolve(root, normalized);
    const inside_root = full_path === root || full_path.startsWith(root + sep);

    if (!inside_root)
      throw new Error(
        `[Oxarion] render${kind === "fragment" ? "Fragment" : ""}: template path is outside the allowed directory`,
      );

    return full_path;
  }

  private async get_compiled_template(
    kind: TemplateKind,
    file_path: string,
  ): Promise<CompiledTemplate> {
    const full_path = this.resolve_template_path(kind, file_path);
    const cached = this.compiled_cache.get(full_path);
    if (cached && this.cache_enabled) return cached;

    const source = await readFile(full_path, "utf8");
    const compiled = compile_template(source);

    if (this.cache_enabled) this.compiled_cache.set(full_path, compiled);
    return compiled;
  }

  async render_page(file_path: string, data: RenderData = {}): Promise<string> {
    const compiled = await this.get_compiled_template("page", file_path);
    return render_compiled_template(compiled, { ox: data }, this.auto_escape);
  }

  async render_fragment(
    file_path: string,
    data: RenderData = {},
  ): Promise<string> {
    const compiled = await this.get_compiled_template("fragment", file_path);
    return render_compiled_template(compiled, { ox: data }, this.auto_escape);
  }

  clear_cache() {
    this.compiled_cache.clear();
  }

  get_pages_root() {
    return this.pages_root;
  }

  get_fragments_root() {
    return this.fragments_root;
  }

  get_layouts_root() {
    return this.layouts_root;
  }
}
