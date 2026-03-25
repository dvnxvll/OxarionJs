# Route Injector

Route Injector helps organize large applications by splitting routes into separate modules

## RoutesWrapper

`RoutesWrapper` provides a clean way to group routes by feature

```ts
import { RoutesWrapper } from "oxarionjs"

const user_routes = new RoutesWrapper().inject((router) => {
  router.addHandler("GET", "/profile", (_req, res) => {
    res.json({ name: "John" })
  })

  router.addHandler("PUT", "/profile", (req, res) => {
    res.json({ updated: true })
  })
})
```

## injectWrapper

Mount the wrapped routes under a base path using `injectWrapper`

```ts
import Oxarion from "oxarionjs"

await Oxarion.start({
  port: 3000,
  httpHandler: (router) => {
    router.injectWrapper("/users", user_routes)
  },
})
```

Routes are mounted with the base path prefix:
- `/profile` becomes `/users/profile`
- Middleware on `/users` applies to all injected routes

## Multiple Feature Modules

Split your application into feature files

```ts
// routes/auth.ts
import { RoutesWrapper } from "oxarionjs"

export const auth_routes = new RoutesWrapper().inject((router) => {
  router.addHandler("POST", "/login", async (req, res) => {
    res.json({ token: "abc" })
  })

  router.addHandler("POST", "/logout", (_req, res) => {
    res.json({ ok: true })
  })
})
```

```ts
// routes/posts.ts
import { RoutesWrapper } from "oxarionjs"

export const post_routes = new RoutesWrapper().inject((router) => {
  router.addHandler("GET", "/", (_req, res) => {
    res.json([{ id: 1, title: "Hello" }])
  })

  router.addHandler("POST", "/", async (req, res) => {
    res.json({ created: true })
  })
})
```

```ts
// main.ts
import Oxarion from "oxarionjs"
import { auth_routes } from "./routes/auth"
import { post_routes } from "./routes/posts"

await Oxarion.start({
  port: 3000,
  httpHandler: (router) => {
    router.injectWrapper("/auth", auth_routes)
    router.injectWrapper("/posts", post_routes)
  },
})
```

## With Middleware

Apply middleware to injected routes using `group`

```ts
import { Middleware, RoutesWrapper } from "oxarionjs"

const admin_routes = new RoutesWrapper().inject((router) => {
  router.addHandler("GET", "/dashboard", (_req, res) => {
    res.json({ admin: true })
  })
})

router.group("/admin", (admin) => {
  admin.injectWrapper("/", admin_routes)
}, [Middleware.cors()])
```

## Nested Injection

Inject wrappers inside groups for nested structures

```ts
const api_v1_routes = new RoutesWrapper().inject((router) => {
  router.addHandler("GET", "/status", (_req, res) => {
    res.json({ version: "1.0.0" })
  })
})

router.group("/api", (api) => {
  api.injectWrapper("/v1", api_v1_routes)
})
```

## Benefits

- **Modular**: Split routes by feature or domain
- **Reusable**: Share route modules across projects
- **Testable**: Test route modules in isolation
- **Organized**: Keep large route trees manageable
