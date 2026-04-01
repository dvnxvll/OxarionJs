# SSR Templates

Oxarion can render cached HTML templates on the server.

Use `res.render()` for full pages and `res.renderFragment()` for partial HTML blocks.

## Enable Template Rendering

```ts
await Oxarion.start({
  template: {
    pagesDir: "pages",
    fragmentsDir: "fragments",
    cache: true,
    autoEscape: true,
  },
  httpHandler: (router) => {
    router.addHandler("GET", "/", (_req, res) => {
      return res.render("home.html", {
        title: "Dashboard",
        value: 12,
      })
    })
  },
})
```

## Binding Syntax

Template data is exposed under `ox`.

```html
<h1>{ox.title}</h1>
<div>{ox.value}</div>
```

Server:

```ts
return res.render("home.html", {
  title: "Dashboard",
  value: 12,
})
```

Rules:
- only `ox.*` bindings are rendered
- values are HTML escaped by default
- bindings support nested paths like `{ox.user.name}`

## Full Pages

`pages/home.html`

```html
<!doctype html>
<html>
  <head>
    <title>{ox.title}</title>
  </head>
  <body>
    <h1>{ox.title}</h1>
    <div id="stats">{ox.value}</div>
  </body>
</html>
```

Handler:

```ts
router.addHandler("GET", "/", (_req, res) => {
  return res.render("home", {
    title: "Home",
    value: 12,
  })
})
```

## Fragments

`fragments/stats.html`

```html
<div id="stats">{ox.value}</div>
```

Handler:

```ts
router.addHandler("GET", "/fragments/stats", (_req, res) => {
  return res.renderFragment("stats", {
    value: 13,
  })
})
```

Fragments are usually inserted into a page-defined `ox-anchor` using `ox-place`.

## App Rendering

Useful outside normal route handlers.

```ts
const app = Oxarion.create({
  template: {
    pagesDir: "pages",
    fragmentsDir: "fragments",
  },
  httpHandler: () => {},
})

const html = await app.render("home", { title: "Hello" })
const fragment = await app.renderFragment("stats", { value: 10 })
```

## Cache Behavior

Template compilation is cached by default for performance.

```ts
await Oxarion.start({
  template: {
    cache: true,
  },
  httpHandler: (router) => {},
})
```

If you want file changes to be picked up on each render:

```ts
await Oxarion.start({
  template: {
    cache: false,
  },
  httpHandler: (router) => {},
})
```

## Directory Layout

```text
pages/
  home.html
  dashboard.html

fragments/
  stats.html
  user_card.html
```

## Notes

- `res.render()` is for full SSR pages
- `res.renderFragment()` is for partial HTML responses
- plain SSR does not need the Ox dynamic runtime script
- dynamic `ox-*` HTML behavior is documented in `dynamic_html.md`
- for live pushes, use SSE or WebSocket and call `window.Ox.apply(...)` with fragment HTML
