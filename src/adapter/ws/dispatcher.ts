import type {
  WSHandler,
  WSMessageContext,
  WsDispatcherOptions,
} from "../../types";
import { apply_ws_message_middleware } from "./message_middleware";

const text_decoder = new TextDecoder();

function message_to_text(message: string | Uint8Array): string {
  if (typeof message === "string") return message;
  return text_decoder.decode(message);
}

export function ws_dispatcher(options: WsDispatcherOptions): WSHandler {
  const handlers = options.handlers;
  const middlewares = options.middlewares ?? [];

  const parse = options.parse ?? ((text: string) => JSON.parse(text));
  const get_type =
    options.getType ??
    ((json: unknown) => (json as any)?.type as string | undefined);
  const get_payload =
    options.getPayload ??
    ((json: unknown) => {
      if (json && typeof json === "object" && "payload" in (json as any))
        return (json as any).payload;
      return json;
    });

  const onUnknown = options.onUnknown ?? (() => {});
  const onError = options.onError ?? (async () => {});

  return {
    onMessage: async (ws, message) => {
      const ctx: WSMessageContext = {
        ws,
        raw_message: message,
        message_text: message_to_text(message),
      };

      const final_handler = async (inner_ctx: WSMessageContext) => {
        try {
          if (inner_ctx.json === undefined) {
            inner_ctx.json = parse(inner_ctx.message_text);
          }

          const json = inner_ctx.json as any;
          const type = get_type(json);
          if (!type) {
            await onUnknown(inner_ctx);
            return;
          }

          const handler = (handlers as any)[type] as
            | undefined
            | ((ctx: WSMessageContext, payload: any) => void | Promise<void>);

          if (!handler) {
            await onUnknown(inner_ctx);
            return;
          }

          await handler(inner_ctx, get_payload(json));
        } catch (err) {
          await onError(err, inner_ctx);
        }
      };

      await apply_ws_message_middleware(middlewares, final_handler)(ctx);
    },
  };
}
