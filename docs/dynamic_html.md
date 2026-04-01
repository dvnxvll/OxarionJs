# Dynamic HTML

Oxarion can update named areas of the current page with server-rendered fragments.

The page defines where updates can land with `ox-anchor`.
Actions and live updates choose that destination with `ox-place`.

This keeps page structure and fragment structure separate.

## Mental Model

- `res.render()` returns a full page
- `res.renderFragment()` returns HTML only
- `ox-anchor="name"` defines a named slot in the current page
- `ox-place="name"` sends returned HTML into that slot
- `ox-mode` controls how the HTML is inserted

The fragment file does not decide where it is placed in the page.
The page owns placement.

## Enable Runtime Script

Serve the client runtime:

```ts
await Oxarion.start({
  template: {
    pagesDir: "pages",
    fragmentsDir: "fragments",
  },
  httpHandler: (router) => {
    const ox_script_path = router.serveOx()
  },
})
```

Include it in the page:

```html
<meta name="ox-csrf" content="{ox.csrfToken}" />
<script src="{ox.oxScriptPath}" defer></script>
```

`router.serveOx()` returns the hashed runtime path, for example `/__oxarion/ox.a1b2c3d4e5f6.js`.
Oxarion still serves `/__oxarion/ox.js` as a stable alias, but the returned hashed path is the production path.

Without this script, `ox-*` attributes do nothing.

For mutating requests, the runtime automatically sends `x-ox-csrf` when it finds:
- `<meta name="ox-csrf" content="...">`
- or the default `oxarion_csrf` cookie

## Recommended Structure

Page:

```html
<div ox-anchor="stats">
  <section class="stats-card">
    <strong>{ox.value}</strong>
  </section>
</div>

<button ox-get="/fragments/stats" ox-place="stats">
  Refresh
</button>
```

Fragment:

```html
<section class="stats-card">
  <strong>{ox.value}</strong>
</section>
```

Handler:

```ts
router.addHandler("GET", "/fragments/stats", (_req, res) => {
  return res.renderFragment("stats", {
    value: 14,
  })
})
```

When the button is clicked, Oxarion:
- sends the request
- receives fragment HTML
- finds `ox-anchor="stats"` in the current page
- inserts the returned HTML there

## Core Attributes

### `ox-anchor`

Defines a named place in the current page that can receive fragment HTML.

```html
<div ox-anchor="stats"></div>
```

This attribute belongs on the page shell, not on action buttons.

### `ox-place`

Tells Oxarion which anchor should receive the response.

```html
<button ox-get="/fragments/stats" ox-place="stats">
  Refresh
</button>
```

This is the main public placement API.

### `ox-mode`

Controls how the returned HTML is applied to the chosen place.

Supported values:
- `inner` default for `ox-place`
- `replace`
- `append`
- `prepend`
- `delete`

Example:

```html
<button
  ox-get="/feed/more"
  ox-place="feed"
  ox-mode="append"
>
  Load more
</button>
```

Mode behavior:
- `inner`: replace anchor contents, keep anchor element
- `replace`: replace the target element itself
- `append`: append HTML at the end of the target
- `prepend`: insert HTML at the start of the target
- `delete`: remove the target element

## Request Attributes

### `ox-get`

Send a GET request.

```html
<button ox-get="/fragments/stats" ox-place="stats">Refresh</button>
```

### `ox-post`

Send a POST request.

```html
<form ox-post="/users" ox-place="users">
  <input name="name" />
  <button type="submit">Save</button>
</form>
```

If you use `Middleware.csrf()`, keep the middleware order:
- `Middleware.session()`
- `Middleware.csrf()`

Then render the token once:

```html
<meta name="ox-csrf" content="{ox.csrfToken}" />
```

### `ox-put`

Send a PUT request.

### `ox-delete`

Send a DELETE request.

## Extra Request Behavior

### `ox-include`

Include extra form fields or controls in the request.

```html
<input id="search" name="q" />
<button
  ox-get="/search"
  ox-place="results"
  ox-include="#search"
>
  Search
</button>
```

Rules:
- accepts one or more CSS selectors separated by commas
- forms are serialized as `FormData`
- standalone controls use their `name` and current value
- closest form is already included automatically when present

### `ox-trigger`

Overrides the default event.

```html
<input ox-get="/search" ox-place="results" ox-trigger="input" />
```

Supported values:
- `click`
- `submit`
- `change`
- `input`
- `load`

### `ox-confirm`

Show a browser confirm dialog before the request is sent.

```html
<button
  ox-delete="/posts/1"
  ox-place="post-1"
  ox-mode="delete"
  ox-confirm="Delete this post?"
>
  Delete
</button>
```

## Default Events

You do not manually register events.

Default trigger rules:
- `form` with `ox-*` request attribute -> `submit`
- `input`, `select`, `textarea` -> `change`
- all other supported elements -> `click`

`ox-trigger` overrides the default rule.

## `load` Trigger

`ox-trigger="load"` runs automatically when the page is ready.

```html
<div
  ox-get="/fragments/stats"
  ox-place="stats"
  ox-trigger="load"
></div>
```

When new HTML is inserted, Oxarion scans the inserted content again so nested load triggers can run too.

## Form Behavior

For forms:
- `ox-get` serializes fields into the query string
- `ox-post`, `ox-put`, and `ox-delete` send `FormData`

Example:

```html
<form ox-get="/search" ox-place="results">
  <input name="q" />
  <button type="submit">Search</button>
</form>
```

## Server Contract

Dynamic HTML works best when the server returns fragment HTML.

```ts
return res.renderFragment("results", {
  items,
})
```

Oxarion does not create local reactive browser state.
The browser updates because the server returns new HTML and the runtime inserts it into the current page.

## Response Overrides

The runtime respects these optional response headers:

High-level placement headers:
- `x-ox-place`
- `x-ox-mode`

Low-level compatibility headers:
- `x-ox-target`
- `x-ox-swap`

If you use the high-level API, prefer `x-ox-place` and `x-ox-mode`.

## Global Runtime API

The client runtime exposes `window.Ox`:

- `Ox.swap(target, html, mode?)`
- `Ox.apply({ place?, target?, html, mode?, swap? })`
- `Ox.request(target)`
- `Ox.getCsrfToken()`

This is useful for SSE or custom event integration.

Example:

```js
const es = new EventSource("/events")

es.addEventListener("stats", (event) => {
  const payload = JSON.parse(event.data)
  window.Ox.apply(payload)
})
```

Recommended payload shape:

```ts
{
  place: "stats",
  html: "<section class=\"stats-card\"><strong>15</strong></section>",
  mode: "inner"
}
```

You can also dispatch a custom DOM event:

```js
document.dispatchEvent(new CustomEvent("ox:swap", {
  detail: {
    place: "stats",
    html: "<section class=\"stats-card\"><strong>15</strong></section>",
    mode: "inner",
  }
}))
```

## Compatibility

Oxarion still supports the older low-level selector model:
- `ox-target`
- `ox-swap`

That path is still useful for advanced control, but the recommended structure is:
- page defines `ox-anchor`
- actions use `ox-place`
- updates use `ox-mode`
