# Production Deployment

## Session Store

Do not use the default memory session store for multi-instance or restart-safe deployments.

Use a durable backend:

```ts
import Oxarion, { Middleware } from "oxarionjs"

const session_store = Middleware.createRedisSessionStore({
  url: process.env.REDIS_URL,
  prefix: "oxarion:sess:",
})

await Oxarion.start({
  httpHandler: (router) => {
    router.addHandler("GET", "/", (_req, res) => res.text("ok"))
  },
  safeMwRegister: (router) => {
    router.multiMiddleware(
      "/",
      [
        Middleware.session({
          cookieName: "oxarion_session",
          store: session_store,
          secure: true,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          rolling: true,
        }),
        Middleware.csrf({
          secure: true,
          sameSite: "lax",
          path: "/",
        }),
      ],
      true,
    )
  },
})
```

## Middleware Order

Order matters:

1. `Middleware.session()`
2. body parser middleware like `Middleware.urlencoded()` if form field CSRF tokens are used
3. `Middleware.csrf()`
4. route handlers

For Ox runtime requests, the runtime sends `x-ox-csrf` automatically, so body parsing is not required for that path.

## Cookie Settings

Recommended production defaults:

- `secure: true` behind HTTPS
- `httpOnly: true` for the session cookie
- `sameSite: "lax"` unless you have a cross-site requirement
- explicit `cookieName`
- explicit `path`

Use `sameSite: "none"` only when you truly need cross-site cookies, and pair it with `secure: true`.

## Ox Runtime Asset

Use the hashed path returned by `router.serveOx()` in rendered pages:

```ts
const ox_script_path = router.serveOx()
```

```html
<script src="{ox.oxScriptPath}" defer></script>
```

Why:
- the hashed path can be cached as immutable
- `/__oxarion/ox.js` stays as a stable alias, but should not be the main production path

## CSRF Token Exposure

For Ox runtime pages, render the token once:

```html
<meta name="ox-csrf" content="{ox.csrfToken}" />
```

This lets the runtime send `x-ox-csrf` automatically for `ox-post`, `ox-put`, and `ox-delete`.

## Verification Checklist

Before shipping:

1. run `bun test`
2. run `bun run build`
3. run `bash tests/e2e/ox_smoke.sh`
4. if Docker is available, run `bash tests/integration/redis_check.sh`
5. run `bun run benchmarks/run-ssr-runtime-benchmark.ts`

## Operational Notes

- benchmark on a quiet machine before comparing numbers
- use Redis or another durable store when you scale beyond one process
- keep TLS termination and cookie settings aligned
- treat the browser smoke script as a fast regression check, not a full browser suite
