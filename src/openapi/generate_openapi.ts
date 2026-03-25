import type { Method } from "../types";

import type {
  OpenApiOptions,
  OpenApiParameter,
  OpenApiRouteDefinition,
} from "../types";

function path_to_openapi_template(path: string): {
  template: string;
  parameters: OpenApiParameter[];
} {
  const parts = path.split("/").filter((p) => p.length);
  if (!parts.length) return { template: "/", parameters: [] };

  const parameters: OpenApiParameter[] = [];
  const out_parts: string[] = [];

  for (const seg of parts) {
    if (seg.startsWith("[...") && seg.endsWith("]")) {
      const name = seg.slice(4, -1);
      out_parts.push(`{${name}}`);
      parameters.push({
        name,
        in: "path",
        required: true,
        schema: { type: "array", items: { type: "string" } },
        description: "Catch-all route param",
      });
      continue;
    }

    if (seg.startsWith("[") && seg.endsWith("]")) {
      const name = seg.slice(1, -1);
      out_parts.push(`{${name}}`);
      parameters.push({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Route param",
      });
      continue;
    }

    out_parts.push(seg);
  }

  return {
    template: "/" + out_parts.join("/"),
    parameters,
  };
}

function method_to_openapi_method(method: Method): Lowercase<Method> {
  return method.toLowerCase() as Lowercase<Method>;
}

export function generate_openapi_spec(
  routes: Array<{
    method: Method;
    path: string;
    handler: unknown;
    openapi?: OpenApiRouteDefinition;
  }>,
  options: OpenApiOptions,
): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const r of routes) {
    const { template, parameters } = path_to_openapi_template(r.path);
    const openapi_method = method_to_openapi_method(r.method);
    const definition = r.openapi;

    const path_entry = (paths[template] ??= {}) as Record<string, unknown>;
    const existing_op =
      path_entry[openapi_method] &&
      typeof path_entry[openapi_method] === "object"
        ? (path_entry[openapi_method] as Record<string, unknown>)
        : null;

    const existing_responses =
      existing_op &&
      existing_op.responses &&
      typeof existing_op.responses === "object"
        ? (existing_op.responses as Record<string, unknown>)
        : {};

    const responses: Record<string, unknown> = {};
    if (definition?.responses && typeof definition.responses === "object") {
      const keys = Object.keys(definition.responses);
      for (const status of keys) {
        const r_def = definition.responses[status];
        const description = r_def?.description ?? "OK";
        const content_type = r_def?.contentType ?? "application/json";

        if (r_def?.schema) {
          responses[status] = {
            description,
            content: {
              [content_type]: {
                schema: r_def.schema,
              },
            },
          };
        } else responses[status] = { description };
      }
    } else if (Object.keys(existing_responses).length) {
      const e_keys = Object.keys(existing_responses);
      for (const status of e_keys)
        responses[status] = existing_responses[status];
    } else responses["200"] = { description: "OK" };

    const request_body = definition?.requestBody?.schema
      ? {
          required: definition.requestBody.required ?? true,
          content: {
            [definition.requestBody.contentType ?? "application/json"]: {
              schema: definition.requestBody.schema,
            },
          },
        }
      : undefined;

    const definition_parameters = definition?.parameters;
    const op_parameters =
      definition_parameters && definition_parameters.length
        ? definition_parameters
        : parameters;

    const op = {
      ...(existing_op ?? {}),
      ...(request_body ? { requestBody: request_body } : {}),
      responses,
      ...(op_parameters.length ? { parameters: op_parameters } : {}),
    };

    path_entry[openapi_method] = op;
  }

  return {
    openapi: "3.0.3",
    info: options.info,
    ...(options.servers && options.servers.length
      ? { servers: options.servers }
      : {}),
    paths,
  };
}
