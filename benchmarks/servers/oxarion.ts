import { Oxarion, OxarionResponse } from "oxarion";

const PORT = 8787;

const JSON_PAYLOAD = {
  message: "Hello World",
  data: { foo: "bar", count: 123 },
};

Oxarion.start({
  port: PORT,
  host: "127.0.0.1",
  checkLatestVersion: false,
  httpHandler: (router) => {
    router.addHandler("GET", "/health", () => {
      return OxarionResponse.text("ok");
    });

    router.addHandler("GET", "/json", () => {
      return OxarionResponse.json(JSON_PAYLOAD);
    });

    router.addHandler("GET", "/text", () => {
      return OxarionResponse.text("Hello World");
    });

    router.addHandler("GET", "/echo/[id]", (req) => {
      const id = req.getParam("id");
      const query = req.getQueries();
      return OxarionResponse.json({ id, query });
    });
  },
});

console.log(`[Oxarion] Benchmark server running on http://127.0.0.1:${PORT}`);
