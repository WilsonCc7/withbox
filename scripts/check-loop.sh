#!/usr/bin/env bash
# End-to-end check of the tracking loop against the built Worker.
#
# Server actions are invoked the way a browser without JavaScript would: by
# POSTing the form's own fields, including the hidden action input vinext
# renders for progressive enhancement. Nothing here needs a browser.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8787}"
# Must match BETTER_AUTH_URL baked into the Worker, or Better Auth rejects the
# request with INVALID_ORIGIN and Next rejects action POSTs with 403.
BASE="http://localhost:${PORT}"
JAR="$(mktemp)"
EMAIL="loop-$(date +%s)@example.com"
PASS="hunter2hunter2"

pnpm run build >/tmp/loop-build.log 2>&1 || { echo "BUILD FAILED"; tail -20 /tmp/loop-build.log; exit 1; }

pnpm exec vite preview --port "$PORT" >/tmp/loop-serve.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -f "$JAR"' EXIT

for _ in $(seq 1 60); do
  sleep 1
  curl -sf -m 2 -o /dev/null "$BASE/api/health" 2>/dev/null && break
done

fail() { echo "FAIL: $1"; exit 1; }

# Local D1 may be empty on a fresh start; this is idempotent.
bash scripts/init-local-db.sh "$BASE"

# Extract the hidden action field name for a server action, e.g. "toggleWatched".
action_for() {
  python3 scripts/find-action.py "$1" "$2"
}

# Visible text of a page, with the RSC payload stripped, for text assertions.
body() {
  python3 scripts/page-body.py "$1"
}

# POST one server action the way a no-JS browser would.
post_action() {
  local url="$1" action="$2"
  shift 2
  local args=(-F "$action=")
  for kv in "$@"; do args+=(-F "$kv"); done
  curl -s -m 20 -X POST "$url" -b "$JAR" -c "$JAR" -H "Origin: $BASE" \
    "${args[@]}" -o /dev/null -w '%{http_code}'
}

# --- sign up -------------------------------------------------------------
STATUS=$(curl -s -m 20 -X POST "$BASE/api/auth/sign-up/email" \
  -H "Content-Type: application/json" -H "Origin: $BASE" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Loop\"}" \
  -c "$JAR" -o /tmp/loop-signup.json -w '%{http_code}')
[[ "$STATUS" == "200" ]] || { cat /tmp/loop-signup.json; fail "sign-up returned $STATUS"; }
grep -q 'session' "$JAR" || fail "sign-up did not set a session cookie"
echo "ok  sign-up + session cookie"

# --- signed out ----------------------------------------------------------
curl -s -m 15 "$BASE/movie/550" -o /tmp/out.html
body /tmp/out.html | grep -q "to track this film" || fail "signed-out film page shows no sign-in prompt"
echo "ok  signed-out page shows sign-in prompt"

# --- signed in -----------------------------------------------------------
curl -s -m 15 "$BASE/movie/550" -b "$JAR" -o /tmp/in.html
body /tmp/in.html | grep -q "to track this film" && fail "signed-in page still shows the prompt"
body /tmp/in.html | grep -q "Mark watched" || fail "signed-in page has no watch toggle"
echo "ok  signed-in page renders the tracking controls"

ACTION=$(action_for /tmp/in.html toggleWatched)
[[ -n "$ACTION" ]] || fail "no toggleWatched action on the film page"
STATUS=$(post_action "$BASE/movie/550" "$ACTION" kind=movie tmdbId=550)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "toggleWatched returned $STATUS"

curl -s -m 15 "$BASE/movie/550" -b "$JAR" -o /tmp/after.html
body /tmp/after.html | grep -q "Mark watched" && fail "label still says 'Mark watched'"
body /tmp/after.html | grep -q "✓ Watched" || fail "watched state not reflected"
echo "ok  watched state stored and reflected"

# --- watchlist -----------------------------------------------------------
ACTION=$(action_for /tmp/after.html toggleWatchlist)
[[ -n "$ACTION" ]] || fail "no toggleWatchlist action on the film page"
STATUS=$(post_action "$BASE/movie/550" "$ACTION" kind=movie tmdbId=550)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "toggleWatchlist returned $STATUS"

curl -s -m 15 "$BASE/watchlist" -b "$JAR" -o /tmp/wl.html
body /tmp/wl.html | grep -q "Fight Club" || fail "watchlist does not list the added film"
echo "ok  watchlist page lists the added film"

# --- rating --------------------------------------------------------------
ACTION=$(action_for /tmp/after.html setRating)
[[ -n "$ACTION" ]] || fail "no setRating action on the film page"
STATUS=$(post_action "$BASE/movie/550" "$ACTION" kind=movie tmdbId=550 value=8)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "setRating returned $STATUS"

curl -s -m 15 "$BASE/movie/550" -b "$JAR" -o /tmp/rated.html
# React splits the "4 / 5" readout into separate text nodes, so assert on the
# star glyph instead: 8 half-stars renders "★★★★☆", absent when unrated.
body /tmp/rated.html | grep -q "★★★★☆" || fail "rating not displayed"
echo "ok  rating stored and displayed"

# --- review --------------------------------------------------------------
ACTION=$(action_for /tmp/rated.html setReview)
[[ -n "$ACTION" ]] || fail "no setReview action on the film page"
STATUS=$(post_action "$BASE/movie/550" "$ACTION" kind=movie tmdbId=550 body="First rule.")
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "setReview returned $STATUS"

curl -s -m 15 "$BASE/movie/550" -b "$JAR" -o /tmp/reviewed.html
body /tmp/reviewed.html | grep -q "First rule." || fail "review not displayed"
echo "ok  review stored and displayed"

# --- episode progress ----------------------------------------------------
curl -s -m 15 "$BASE/tv/94605/season/1" -b "$JAR" -o /tmp/season.html
EP_ACTION=$(action_for /tmp/season.html toggleWatched)
[[ -n "$EP_ACTION" ]] || fail "no episode action on the season page"
STATUS=$(post_action "$BASE/tv/94605/season/1" "$EP_ACTION" kind=tv tmdbId=94605 season=1 episode=1)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "episode toggle returned $STATUS"

curl -s -m 15 "$BASE/tv/94605/season/1" -b "$JAR" -o /tmp/season-after.html
# React renders "{n} of {m} watched" as separate text nodes, so count the
# episode marker labels instead — an exact, split-proof assertion.
COUNT=$(body /tmp/season-after.html | grep -o "✓ Watched" | wc -l)
[[ "$COUNT" == "1" ]] || fail "expected 1 marked episode, found $COUNT"
echo "ok  episode marked watched (1 of 9)"

# --- whole-season shortcut ----------------------------------------------
ACTION=$(action_for /tmp/season-after.html markSeason)
[[ -n "$ACTION" ]] || fail "no markSeason action on the season page"
STATUS=$(post_action "$BASE/tv/94605/season/1" "$ACTION" tmdbId=94605 season=1 \
  episodes=1,2,3,4,5,6,7,8,9)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "markSeason returned $STATUS"

curl -s -m 15 "$BASE/tv/94605/season/1" -b "$JAR" -o /tmp/season-full.html
COUNT=$(body /tmp/season-full.html | grep -o "✓ Watched" | wc -l)
[[ "$COUNT" == "9" ]] || fail "expected 9 marked episodes, found $COUNT"
echo "ok  whole-season shortcut marked all 9 episodes"

echo "ALL CHECKS PASSED"
