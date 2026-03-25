import fastify from "fastify";

const PORT = 8789;
const server = fastify({ logger: false });

const JSON_PAYLOAD = {
  message: "Hello World",
  data: { foo: "bar", count: 123 },
};

server.get("/health", () => {
  return "ok";
});

server.get("/json", () => {
  return JSON_PAYLOAD;
});

server.get("/text", () => {
  return "Hello World";
});

server.get("/echo/:id", (request) => {
  const id = (request.params as { id: string }).id;
  const query = request.query as Record<string, string>;
  return { id, query };
});

const start = async () => {
  try {
    await server.listen({ port: PORT, host: "127.0.0.1" });
    console.log(
      `[Fastify] Benchmark server running on http://127.0.0.1:${PORT}`,
    );
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
