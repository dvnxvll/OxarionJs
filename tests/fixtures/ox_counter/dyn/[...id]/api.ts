import { OxarionResponse, type DynamicRouteHandler } from "../../../../../src/index.ts";

export const GET: DynamicRouteHandler = async (req, res) => {
  const param = req.getParam("id");
  return OxarionResponse.json({ id: param });
};
