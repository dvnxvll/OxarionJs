#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXAMPLE_DIR="$ROOT_DIR/tests/fixtures/ox_counter"
CLI_DIR="$(mktemp -d)"
SESSION_ID="ox-counter-e2e-$$"
PORT="${OX_TEST_PORT:-9191}"
HOST="${OX_TEST_HOST:-127.0.0.1}"
BASE_URL="http://$HOST:$PORT"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  (
    cd "$CLI_DIR" &&
      bunx --silent @playwright/cli -s="$SESSION_ID" close >/dev/null 2>&1
  ) || true
  rm -rf "$CLI_DIR"
}

trap cleanup EXIT

run_cli() {
  (
    cd "$CLI_DIR" &&
      bunx --silent @playwright/cli -s="$SESSION_ID" "$@"
  )
}

wait_for_server() {
  local i=0
  while (( i < 100 )); do
    if curl -fsS "$BASE_URL" >/dev/null 2>&1; then
      return
    fi
    sleep 0.2
    i=$((i + 1))
  done
  echo "server did not start on $BASE_URL" >&2
  exit 1
}

snapshot_file() {
  local output
  output="$(run_cli snapshot)"
  local rel
  rel="$(printf '%s\n' "$output" | sed -n 's/.*\[Snapshot\](\(.*\.yml\)).*/\1/p' | tail -n 1)"
  if [[ -z "$rel" ]]; then
    printf '%s\n' "$output" >&2
    echo "failed to capture snapshot path" >&2
    exit 1
  fi
  printf '%s/%s\n' "$CLI_DIR" "$rel"
}

button_ref() {
  local file="$1"
  local label="$2"
  sed -n "s/.*button \"$label\" \\[ref=\\([^]]*\\)\\].*/\\1/p" "$file" | head -n 1
}

counter_value() {
  local file="$1"
  sed -n 's/.*strong \[ref=[^]]*\]: "\([^"]*\)".*/\1/p' "$file" | head -n 1
}

assert_equals() {
  local actual="$1"
  local expected="$2"
  local message="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "$message: expected '$expected', got '$actual'" >&2
    exit 1
  fi
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "$message: missing '$needle'" >&2
    printf '%s\n' "$haystack" >&2
    exit 1
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "$message: unexpected '$needle'" >&2
    printf '%s\n' "$haystack" >&2
    exit 1
  fi
}

(
  cd "$EXAMPLE_DIR" &&
    OX_TEST_HOST="$HOST" OX_TEST_PORT="$PORT" bun run index.ts
) >/dev/null 2>&1 &
SERVER_PID="$!"

wait_for_server

initial_html="$(curl -fsS "$BASE_URL")"
assert_contains "$initial_html" '<meta name="ox-csrf" content="' "initial page is missing the csrf meta tag"
assert_contains "$initial_html" '<script src="/__oxarion/ox.' "initial page is missing the hashed ox runtime path"

runtime_path="$(printf '%s\n' "$initial_html" | sed -n 's/.*<script src="\([^"]*\/__oxarion\/ox\.[^"]*\.js\)".*/\1/p' | head -n 1)"
if [[ -z "$runtime_path" ]]; then
  echo "failed to extract hashed runtime path from initial html" >&2
  exit 1
fi

runtime_headers="$(curl -fsS -D - -o /dev/null "$BASE_URL${runtime_path#http://$HOST:$PORT}" | tr '[:upper:]' '[:lower:]')"
assert_contains "$runtime_headers" "cache-control: public, max-age=31536000, immutable" "hashed runtime is missing immutable cache headers"

alias_headers="$(curl -fsS -D - -o /dev/null "$BASE_URL/__oxarion/ox.js" | tr '[:upper:]' '[:lower:]')"
assert_contains "$alias_headers" "cache-control: no-cache, max-age=0, must-revalidate" "runtime alias is missing no-cache headers"

run_cli open "$BASE_URL" --browser=firefox >/dev/null

snapshot="$(snapshot_file)"
assert_equals "$(counter_value "$snapshot")" "0" "initial count mismatch"
count_ref="$(button_ref "$snapshot" "Count")"
reset_ref="$(button_ref "$snapshot" "Reset")"

count_click_output="$(run_cli click "$count_ref")"
assert_not_contains "$count_click_output" "Modal state" "count click opened a dialog"

snapshot="$(snapshot_file)"
assert_equals "$(counter_value "$snapshot")" "1" "count after first click mismatch"

run_cli reload >/dev/null
snapshot="$(snapshot_file)"
assert_equals "$(counter_value "$snapshot")" "1" "count after reload mismatch"

count_ref="$(button_ref "$snapshot" "Count")"
reset_ref="$(button_ref "$snapshot" "Reset")"

count_click_output="$(run_cli click "$count_ref")"
assert_not_contains "$count_click_output" "Modal state" "second count click opened a dialog"

snapshot="$(snapshot_file)"
assert_equals "$(counter_value "$snapshot")" "2" "count after second click mismatch"

reset_ref="$(button_ref "$snapshot" "Reset")"
reset_click_output="$(run_cli click "$reset_ref")"
assert_contains \
  "$reset_click_output" \
  '["confirm" dialog with message "Reset the counter back to zero?"]' \
  "reset click did not open the expected confirm dialog"

run_cli dialog-accept >/dev/null
snapshot="$(snapshot_file)"
assert_equals "$(counter_value "$snapshot")" "0" "count after reset mismatch"

echo "ox counter browser e2e passed"
