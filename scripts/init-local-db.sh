#!/usr/bin/env bash
# Apply the Drizzle migrations to the local development D1 database.
#
# Runs before any local check that touches the database. It goes through the
# Cloudflare Vite plugin's Local Explorer API, which executes SQL against the
# same database the Worker sees.
#
# Statements are applied ONE AT A TIME and "already exists" is skipped, so the
# script is idempotent *and* can add new tables to an existing local database.
# It used to post every migration as a single batch: because SQLite DDL has no
# IF NOT EXISTS here, the batch failed on the first table that already existed,
# the whole request was abandoned, and a newly generated migration silently
# never ran. The old code then printed "already migrated" and exited 0.
#
# Usage: scripts/init-local-db.sh [base-url]
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${1:-http://127.0.0.1:8787}"
API="$BASE/cdn-cgi/local/explorer/api"

UUID=$(curl -sf -m 15 "$API/d1/database" \
  | python3 -c "import json,sys; rows=json.load(sys.stdin)['result']; print(rows[0]['uuid'] if rows else '')")

if [[ -z "$UUID" ]]; then
  echo "no local D1 database found at $API/d1/database" >&2
  exit 1
fi

python3 - "$API" "$UUID" <<'PY'
import glob, json, sys, urllib.error, urllib.request

api, uuid = sys.argv[1], sys.argv[2]

stmts = []
for path in sorted(glob.glob("drizzle/*.sql")):
    for chunk in open(path).read().split("--> statement-breakpoint"):
        sql = chunk.strip().rstrip(";").strip()
        if sql:
            stmts.append((path, sql))


def run(sql):
    """Execute one statement. Returns (ok, error_text)."""
    body = json.dumps({"batch": [{"sql": sql}]}).encode()
    req = urllib.request.Request(
        f"{api}/d1/database/{uuid}/raw",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    payload = None
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as err:
        # Statement failures come back as HTTP 500 with a JSON body.
        try:
            payload = json.loads(err.read().decode(errors="replace"))
        except json.JSONDecodeError:
            return False, f"HTTP {err.code}"
    if payload is None or not payload.get("success"):
        return False, json.dumps(payload.get("errors") if payload else [])
    return True, ""


applied = skipped = 0
for i, (path, sql) in enumerate(stmts, 1):
    ok, err = run(sql)
    if ok:
        applied += 1
        continue
    if "already exists" in err:
        skipped += 1
        continue
    print(f"migration failed in {path} (statement {i}): {err[:400]}", file=sys.stderr)
    sys.exit(1)

if applied:
    print(f"applied {applied} statement(s) to local D1 {uuid[:8]}"
          + (f", skipped {skipped} already present" if skipped else ""))
else:
    print(f"local D1 already up to date ({skipped} statement(s) present)")
PY
