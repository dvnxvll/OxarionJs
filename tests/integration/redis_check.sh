#!/usr/bin/env bash
set -euo pipefail

OX_ENABLE_REDIS_INTEGRATION=1 bun test tests/integration/redis_session_store.test.ts
