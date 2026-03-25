<p align="center">
  <img src="assets/OxarionIcon.png" alt="OxarionJs" width="240" />
</p>

<p align="center">
  "Because going faster shouldn’t mean writing more nonsense"
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/oxarionjs">
    <img src="https://img.shields.io/npm/dm/oxarionjs?style=flat-square&label=downloads" alt="NPM Downloads" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/github/license/dvnxvll/OxarionJs?style=flat-square" alt="License" />
  </a>
</p>

---

OxarionJs is a TypeScript-first backend framework built on Bun.

It keeps the flow direct, the API clean, and the abstractions where they actually help.

## Why OxarionJs

- Built on Bun for fast runtime and a tight development loop
- Type-safe route params
- Route groups and middleware chains
- Route injector for modular structure
- File-based dynamic routing
- Request and response helpers
- Native WebSocket route support
- Minimal flow without high-level clutter

## Install

```bash
bun add oxarionjs
```

## Quick start

```ts
import Oxarion, { Middleware } from "oxarionjs";

await Oxarion.start({
  host: "127.0.0.1",
  port: 3000,
  httpHandler: (router) => {
    router.addHandler("GET", "/", (_req, res) => {
      res.json({ message: "Welcome to OxarionJs" });
    });
  },
  safeMwRegister: (router) => {
    router.multiMiddleware("/", [Middleware.cors(), Middleware.logger()], true);
  },
});
```

Run it with

```bash
bun run src/index.ts
```

## Dynamic routing

```ts
import Oxarion from "oxarionjs";

await Oxarion.start({
  dynamicRouting: {
    dir: "dyn",
    handlerFile: "api",
    extensions: ["ts", "js"],
    onConflict: "keepManual",
  },
  httpHandler: () => {},
});
```

`dyn/test/api.ts` maps to `/test`.

Route modules can export HTTP method functions or a static class.

```ts
import { OxarionResponse, type OxarionRequest } from "oxarionjs";

export default class TestApi {
  static async GET(req: OxarionRequest, _res: OxarionResponse) {
    return OxarionResponse.json({ path: req.url() });
  }
}
```

## Benchmark

OxarionJs is built to stay lightweight on the hot path, and local benchmarking reflects that well.

Here is an example result from the Bun benchmark suite used during development:

| Framework         | Average Req/Sec |
| ----------------- | --------------: |
| Oxarion           |          232632 |
| Previous baseline |          179348 |

That specific change represents roughly a **30% throughput improvement**.

For a single endpoint sample from the local benchmark runner:

| Endpoint      | Framework | Req/Sec | Avg Latency | P99 Latency |
| ------------- | --------- | ------: | ----------: | ----------: |
| JSON Response | Oxarion   |  254320 |    0.785 ms |    1.140 ms |

The full generated benchmark report is written to [`benchmarks/Results.md`](./benchmarks/Results.md).

### Benchmark notes

- Benchmarks are run locally on Bun using `oha`
- Measured runs use sustained timed execution rather than short burst tests
- Results are more useful for comparing framework overhead on identical handlers than for making universal performance claims
- Numbers may vary based on hardware, Bun version, OS scheduling, thermal state, and background apps

If you want to reproduce the same style of measurement, see:

- [Testing and benchmarking](./docs/testing_and_benchmarking.md)

## Docs

Start here if you want the full guide.

- [Docs index](./docs/index.md)
- [Getting started](./docs/getting_started.md)
- [Server options](./docs/server_options.md)
- [Routing](./docs/routing.md)
- [Route Injector](./docs/route_injector.md)
- [Dynamic routing](./docs/dynamic_routing.md)
- [Middleware](./docs/middleware.md)
- [Request and response](./docs/request_and_response.md)
- [WebSocket](./docs/websocket.md)
- [API reference](./docs/api_reference.md)
- [Testing and benchmarking](./docs/testing_and_benchmarking.md)

## License

[MIT](./LICENSE)
