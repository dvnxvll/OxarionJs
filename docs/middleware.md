# Middleware

## Where Middleware Runs

Middleware executes in route handler flow

You can register middleware with

- `router.middleware(base, fn, allRoutes?)`
- `router.multiMiddleware(base, [fn1, fn2], allRoutes?)`

Use `safeMwRegister` in `Oxarion.start` when you want middleware after route registration

## Built In Middleware

Import

```ts
import { Middleware } from "oxarionjs"
```

### cors

```ts
Middleware.cors({
  origin: ["https://app.example.com"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
})
```

### json

```ts
Middleware.json({ limit: "2mb" })
```

`limit` can be number of bytes or string like `500kb`, `2mb`, `1gb`

### urlencoded

```ts
Middleware.urlencoded({ extended: true })
```

### logger

```ts
Middleware.logger()

Middleware.logger({
  writer: (line) => my_logger.info(line),
})
```

### rateLimit

```ts
Middleware.rateLimit({
  limit: 100,
  windowMs: 60_000,
  keyGenerator: (req) => req.getHeaders()["x-real-ip"] || "anon",
  statusCode: 429,
})
```

### securityHeaders

```ts
Middleware.securityHeaders({
  xFrameOptions: "SAMEORIGIN",
  referrerPolicy: "no-referrer",
  permissionsPolicy: "none",
})
```

### session

Session is in-memory and meant for production-compatible demos and small deployments

```ts
Middleware.session({
  cookieName: "oxarion_session",
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  rolling: true,
})
```

### validateJson

`schema` must implement `safeParse(value)` like Zod

```ts
Middleware.validateJson(schema, { message: "Invalid payload" })
```

### validateUrlencoded

```ts
Middleware.validateUrlencoded(schema, { message: "Invalid form body" })
```

## Custom Middleware

```ts
const auth_mw = async (req, res, next) => {
  const token = req.getHeaders()["authorization"]
  if (!token) {
    res.setStatus(401).json({ error: "unauthorized" })
    return
  }

  await next()
}

router.middleware("/api", auth_mw)
```

## Middleware With Returned Response Style

If a downstream handler returns `Response`, middleware chain still supports it

```ts
router.middleware("/", async (_req, _res, next) => {
  const maybe_response = await next()
  if (maybe_response instanceof Response) {
    // optional post processing branch
  }
})
```
