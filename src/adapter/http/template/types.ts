/** Key-value data passed to page and fragment templates during rendering. */
export type RenderData = Record<string, unknown>;

/** Options for controlling the HTTP response of a rendered page or fragment. */
export type RenderOptions = {
  /** HTTP status code for the response. Defaults to `200`. */
  status?: number;
  /** Additional headers to include in the response. */
  headers?: HeadersInit;
};

/** Configuration for the built-in template engine. */
export type TemplateOptions = {
  /** Whether the template engine is enabled. */
  enabled?: boolean;
  /** Directory containing full page templates. */
  pagesDir?: string;
  /** Directory containing fragment (partial) templates. */
  fragmentsDir?: string;
  /** Directory containing layout templates used for wrapping pages. */
  layoutsDir?: string;
  /** Whether to cache compiled templates in memory. */
  cache?: boolean;
  /** Whether to HTML-escape interpolated values by default. */
  autoEscape?: boolean;
  /** Template file extension (e.g. `".html"`). */
  extension?: string;
};

/** Distinguishes full page renders from partial fragment renders. */
export type TemplateKind = "page" | "fragment";

/** Single dynamic getter placeholder within a compiled template. */
type TemplateGetter = {
  /** Dot-separated path to the data property (e.g. `["user", "name"]`). */
  path: string[];
};

/** Pre-parsed template with static string segments and dynamic getter slots. */
export type CompiledTemplate = {
  /** Static HTML string segments between dynamic placeholders. */
  static_parts: string[];
  /** Dynamic value getters, interleaved with `static_parts`. */
  getters: TemplateGetter[];
};
