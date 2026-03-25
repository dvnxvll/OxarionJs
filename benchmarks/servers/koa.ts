import Koa from "koa";
import Router from "@koa/router";

const PORT = 8790;
const app = new Koa();
const router = new Router();

const JSON_PAYLOAD = {
  message: "Hello World",
  data: { foo: "bar", count: 123 },
};

router.get("/health", (ctx) => {
  ctx.type = "text/plain";
  ctx.body = "ok";
});

router.get("/json", (ctx) => {
  ctx.body = JSON_PAYLOAD;
});

router.get("/text", (ctx) => {
  ctx.type = "text/plain";
  ctx.body = "Hello World";
});

router.get("/echo/:id", (ctx) => {
  const id = ctx.params.id;
  const query = ctx.query;
  ctx.body = { id, query };
});

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[Koa] Benchmark server running on http://127.0.0.1:${PORT}`);
});
