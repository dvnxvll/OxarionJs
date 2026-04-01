# Browser E2E

Run the Ox counter browser smoke flow in Firefox:

```bash
bash tests/e2e/ox_smoke.sh
```

The script:

- starts `tests/fixtures/ox_counter`
- drives Firefox through `@playwright/cli`
- verifies the hashed runtime asset and cache headers
- verifies the page exposes a CSRF token before mutations
- clicks `Count`
- reloads and verifies the session state persists
- clicks `Reset` and accepts the confirm dialog

If Firefox runtime is missing:

```bash
(cd /tmp && bunx @playwright/cli install-browser firefox)
```
