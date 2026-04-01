# ox_counter

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

Optional environment overrides:

```bash
OX_TEST_HOST=127.0.0.1 OX_TEST_PORT=9191 bun run index.ts
```

Then open:

```text
http://127.0.0.1:9090
```

## Included example

This sample now includes:
- SSR page rendering with `res.render()`
- fragment updates with `res.renderFragment()`
- dynamic HTML runtime via the hashed path returned by `router.serveOx()`
- page-owned placement with `ox-anchor` and `ox-place`
- session-backed counter state via `Middleware.session()`
- automatic `ox-*` CSRF protection via `Middleware.csrf()`

Click `Count` to increment the counter. Reload the page and the value remains because it is stored in the session.
