import type {
  MiddlewareFn,
  SafeParseSchema,
  ValidationErrorShape,
  ValidationOptions,
} from "../types";

function is_plain_object(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null) return false;
  if (Array.isArray(v)) return false;
  return true;
}

function format_error(details: unknown, message: string): ValidationErrorShape {
  if (!details) return { error: message };
  if (is_plain_object(details)) return { error: message, details };
  return { error: message, details };
}

export function validateJson<TBody>(
  schema: SafeParseSchema<TBody>,
  options: ValidationOptions = {},
): MiddlewareFn {
  const status_code = options.statusCode ?? 400;
  const message = options.message ?? "Invalid JSON body";
  const include_details = options.includeDetails ?? true;

  if (typeof schema !== "object" || schema === null) {
    throw new TypeError("[Oxarion] validateJson: schema must be an object");
  }
  if (typeof (schema as any).safeParse !== "function") {
    throw new TypeError(
      "[Oxarion] validateJson: schema must implement safeParse(value)",
    );
  }

  return async (req, res, next) => {
    try {
      const type = req.getHeaders()["content-type"]?.toLowerCase() ?? "";
      if (!type.includes("application/json")) {
        await next();
        return;
      }

      const raw_body = req.__oxarion_has_body()
        ? req.getBody()
        : await req.json();

      const result = schema.safeParse(raw_body);
      if (result.success) {
        req.__oxarion_set_body(result.data);
        await next();
        return;
      }

      const payload: ValidationErrorShape = format_error(
        include_details ? result.error : undefined,
        message,
      );
      res.setStatus(status_code).json(payload);
      return;
    } catch {
      res.setStatus(status_code).json({ error: message });
      return;
    }
  };
}

export function validateUrlencoded<TBody>(
  schema: SafeParseSchema<TBody>,
  options: ValidationOptions = {},
): MiddlewareFn {
  const status_code = options.statusCode ?? 400;
  const message = options.message ?? "Invalid urlencoded body";
  const include_details = options.includeDetails ?? true;

  if (typeof schema !== "object" || schema === null)
    throw new TypeError(
      "[Oxarion] validateUrlencoded: schema must be an object",
    );
  if (typeof (schema as any).safeParse !== "function")
    throw new TypeError(
      "[Oxarion] validateUrlencoded: schema must implement safeParse(value)",
    );

  return async (req, res, next) => {
    try {
      const type = req.getHeaders()["content-type"]?.toLowerCase() ?? "";
      if (!type.includes("application/x-www-form-urlencoded")) {
        await next();
        return;
      }

      const raw_body = req.__oxarion_has_body()
        ? req.getBody()
        : await req.form();

      const value =
        raw_body && typeof (raw_body as any).getAllFields === "function"
          ? (raw_body as any).getAllFields()
          : raw_body;

      const result = schema.safeParse(value);
      if (result.success) {
        req.__oxarion_set_body(result.data);
        await next();
        return;
      }

      const payload: ValidationErrorShape = format_error(
        include_details ? result.error : undefined,
        message,
      );
      res.setStatus(status_code).json(payload);
      return;
    } catch {
      res.setStatus(status_code).json({ error: message });
      return;
    }
  };
}
