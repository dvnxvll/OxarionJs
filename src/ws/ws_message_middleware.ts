import type {
  WSMessageContext,
  WSMessageFinalHandler,
  WSMessageMiddlewareFn,
} from "../types";

export function compose_ws_message_middleware(
  middlewares: WSMessageMiddlewareFn[],
  final_handler: WSMessageFinalHandler,
): (ctx: WSMessageContext) => Promise<void> {
  return async (ctx) => {
    let i = -1;
    const dispatch = async (index: number): Promise<void> => {
      if (index <= i) throw new Error("next() called multiple times");
      i = index;

      if (index === middlewares.length) {
        await final_handler(ctx);
        return;
      }

      const fn = middlewares[index];
      if (!fn) return;
      let next_called = false;
      await fn(ctx, async () => {
        next_called = true;
        await dispatch(index + 1);
      });

      if (!next_called) return;
    };

    await dispatch(0);
  };
}

export function apply_ws_message_middleware(
  middlewares: WSMessageMiddlewareFn[],
  final_handler: WSMessageFinalHandler,
) {
  const composed = compose_ws_message_middleware(middlewares, final_handler);
  return async (ctx: WSMessageContext) => {
    await composed(ctx);
  };
}
