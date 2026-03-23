import type { MiddlewareFn } from "../types";
import type { OxarionRequest } from "../handler/request";
import type { OxarionResponse } from "../handler/response";
import type { HandlerResult } from "../types";

function compose_middleware(
  middleware: MiddlewareFn[],
  final_handler: (
    req: OxarionRequest<any>,
    res: OxarionResponse
  ) => Promise<HandlerResult> | HandlerResult
): (
  req: OxarionRequest<any>,
  res: OxarionResponse
) => Promise<HandlerResult> {
  return async (req, res) => {
    let i = -1;

    const dispatch = async (index: number): Promise<HandlerResult> => {
      if (index <= i) throw new Error("next() called multiple times");
      i = index;

      if (index === middleware.length) return await final_handler(req, res);

      const fn = middleware[index];
      if (!fn) return;

      let next_called = false;
      let next_result: HandlerResult = undefined;

      await fn(req, res, async () => {
        next_called = true;
        next_result = await dispatch(index + 1);
        return next_result;
      });

      if (next_called) return next_result;
    };

    return await dispatch(0);
  };
}

export { compose_middleware };
