#!/usr/bin/env bash
# End-to-end check of the tracking loop against the built Worker.
#
# Server actions are invoked the way a browser without JavaScript would: by
# POSTing the form's own fields, including the hidden action input vinext
# renders for progressive enhancement. Nothing here needs a browser.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8787}"
# Bake fixture mode into the build so this check is deterministic and never
# touches the network, regardless of the caller's environment or .dev.vars.
export WITHBOX_TMDB_MODE=fixture
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

# --- gated pages send the user back where they were headed ---------------
# The no-JS path cannot follow the redirect (the sanitizer is client-side), so
# assert on the markup: the prompt must carry ?next= for its own path.
curl -s -m 15 "$BASE/watchlist" -o /tmp/wl-out.html
grep -qE 'sign-in\?next=(%2F|/)watchlist' /tmp/wl-out.html \
  || fail "signed-out /watchlist does not link to /sign-in?next=/watchlist"
curl -s -m 15 "$BASE/watched" -o /tmp/wa-out.html
grep -qE 'sign-in\?next=(%2F|/)watched' /tmp/wa-out.html \
  || fail "signed-out /watched does not link to /sign-in?next=/watched"
echo "ok  gated pages carry ?next= into sign-in"

# --- empty states, before anything is marked ----------------------------
# A fresh user has neither a watchlist nor anything watched; both pages must
# say so and offer a way out rather than rendering an empty grid.
curl -s -m 15 "$BASE/watched" -b "$JAR" -o /tmp/wa-empty.html
body /tmp/wa-empty.html | grep -qi "nothing watched yet" \
  || fail "/watched has no empty state for a fresh user"
curl -s -m 15 "$BASE/watchlist" -b "$JAR" -o /tmp/wl-empty.html
body /tmp/wl-empty.html | grep -qi "watchlist is empty" \
  || fail "/watchlist has no empty state for a fresh user"
echo "ok  empty states render for a fresh user"

# --- search states -------------------------------------------------------
curl -s -m 15 "$BASE/search" -o /tmp/se-empty.html
body /tmp/se-empty.html | grep -qi "type a title" \
  || fail "/search with no query shows no guidance"
# Fixture mode has a fixed catalogue, so this query matches nothing by design.
curl -s -m 15 "$BASE/search?q=zzzzzzzzzz" -o /tmp/se-none.html
body /tmp/se-none.html | grep -qi "no results for" \
  || fail "/search with no matches does not say so"
curl -s -m 15 "$BASE/search?q=fight" -o /tmp/se-hit.html
body /tmp/se-hit.html | grep -q "Fight Club" \
  || fail "/search?q=fight does not find Fight Club"
echo "ok  search: no query, no matches, and a hit all render"

# --- auth pages are navigable and carry ?next= ---------------------------
# The redirect itself is client-side, but the shell and the cross-link must be
# in the server-rendered HTML, or a no-JS visitor is stranded.
curl -s -m 15 "$BASE/sign-in?next=/watched" -o /tmp/si.html
body /tmp/si.html | grep -q "Withbox" || fail "sign-in page renders no site header"
grep -qE 'sign-up\?next=(%2F|/)watched' /tmp/si.html \
  || fail "sign-in does not carry ?next= through to sign-up"
curl -s -m 15 "$BASE/sign-up" -o /tmp/su.html
body /tmp/su.html | grep -q "Withbox" || fail "sign-up page renders no site header"
echo "ok  auth pages render the header and carry ?next="

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

# --- the watched page lists it, and the empty state is gone --------------
curl -s -m 15 "$BASE/watched" -b "$JAR" -o /tmp/watched.html
body /tmp/watched.html | grep -q "Fight Club" || fail "/watched does not list the watched film"
body /tmp/watched.html | grep -qi "nothing watched yet" && fail "/watched still shows its empty state"
echo "ok  /watched lists the watched film"

# --- home grows a personal section once there is history -----------------
curl -s -m 15 "$BASE/" -b "$JAR" -o /tmp/home-in.html
body /tmp/home-in.html | grep -q "Recently watched" \
  || fail "home shows no personal section for a signed-in user with history"
curl -s -m 15 "$BASE/" -o /tmp/home-out.html
body /tmp/home-out.html | grep -q "Recently watched" \
  && fail "home shows a personal section to a signed-out visitor"
body /tmp/home-out.html | grep -q "Trending films" || fail "signed-out home lost its trending grid"
echo "ok  home: personal section only when signed in, trending always"

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
# `|| true`: grep exits 1 on zero matches, and `set -o pipefail` would otherwise
# kill the script before the assertion can say what went wrong.
COUNT=$(body /tmp/season-after.html | grep -o "✓ Watched" | wc -l || true)
[[ "$COUNT" == "1" ]] || fail "expected 1 marked episode, found $COUNT"
echo "ok  episode marked watched (1 of 9)"

# Regression: marking a *second* episode must add to the first, not replace it.
# toggleWatched once keyed only on (userId, kind, tmdbId), so the EXISTS check
# found episode 1 and deleted every mark for the show.
SEASON_URL="$BASE/tv/94605/season/1"
curl -s -m 15 "$SEASON_URL" -b "$JAR" -o /tmp/season.html
EP_ACTION=$(action_for /tmp/season.html toggleWatched)
STATUS=$(post_action "$SEASON_URL" "$EP_ACTION" kind=tv tmdbId=94605 season=1 episode=2)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "second episode toggle returned $STATUS"
curl -s -m 15 "$SEASON_URL" -b "$JAR" -o /tmp/season-two.html
COUNT=$(body /tmp/season-two.html | grep -o "✓ Watched" | wc -l || true)
[[ "$COUNT" == "2" ]] || fail "expected 2 marked episodes after marking a second, found $COUNT"
echo "ok  second episode adds rather than replacing"

# Toggling one episode off must not disturb the other.
STATUS=$(post_action "$SEASON_URL" "$EP_ACTION" kind=tv tmdbId=94605 season=1 episode=1)
curl -s -m 15 "$SEASON_URL" -b "$JAR" -o /tmp/season-one.html
COUNT=$(body /tmp/season-one.html | grep -o "✓ Watched" | wc -l || true)
[[ "$COUNT" == "1" ]] || fail "expected 1 marked episode after toggling one off, found $COUNT"
echo "ok  toggling one episode off leaves the other marked"

# --- whole-season shortcut ----------------------------------------------
ACTION=$(action_for /tmp/season-one.html markSeason)
[[ -n "$ACTION" ]] || fail "no markSeason action on the season page"
STATUS=$(post_action "$BASE/tv/94605/season/1" "$ACTION" tmdbId=94605 season=1 \
  episodes=1,2,3,4,5,6,7,8,9)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "markSeason returned $STATUS"

curl -s -m 15 "$BASE/tv/94605/season/1" -b "$JAR" -o /tmp/season-full.html
COUNT=$(body /tmp/season-full.html | grep -o "✓ Watched" | wc -l || true)
[[ "$COUNT" == "9" ]] || fail "expected 9 marked episodes, found $COUNT"
echo "ok  whole-season shortcut marked all 9 episodes"

# --- the player's completion action: reachable, and idempotent -----------
# markWatched is passed as a *prop* to a client component, so unlike every
# action above it has no hidden form field to POST. Its id is still in the RSC
# payload, and invoking it the form way — the id as a multipart field, with no
# Next-Action header — reaches React's FormData path. Sending the same id as a
# Next-Action header instead reaches the RSC-arguments path, which dies at
# decodeReply with "Error: Connection closed". This is the invocation the
# browser performs when the embed reports playback finished.
JAR2="$(mktemp)"
curl -s -m 20 -X POST "$BASE/api/auth/sign-up/email" -H "Content-Type: application/json" \
  -H "Origin: $BASE" -d "{\"email\":\"mw-$(date +%s)@example.com\",\"password\":\"$PASS\",\"name\":\"MW\"}" \
  -c "$JAR2" -o /dev/null

curl -s -m 15 "$BASE/watch/tv/94605?season=1&episode=1" -b "$JAR2" -o /tmp/watch.html
MW=$(python3 -c "
import re
s = open('/tmp/watch.html').read()
m = re.search(r'id..:..([0-9a-f]{6,}#markWatched)', s)
print(m.group(1) if m else '')
")
[[ -n "$MW" ]] || fail "markWatched action id absent from the watch page payload"

# The watch page must also render the bridge's preconditions: a progress-capable
# source (vidlink for TV) and a next-episode link for a mid-season episode.
body /tmp/watch.html | grep -q "marks itself watched" || fail "watch page shows no progress bridge"
body /tmp/watch.html | grep -q "plays the next episode" || fail "watch page offers no next episode"

mark_via_client() {
  curl -s -m 20 -X POST "$BASE/watch/tv/94605?season=1&episode=1" -b "$JAR2" -H "Origin: $BASE" \
    -F "\$ACTION_ID_$MW=" -F "kind=tv" -F "tmdbId=94605" -F "season=1" -F "episode=1" \
    -o /dev/null -w '%{http_code}'
}

STATUS=$(mark_via_client)
[[ "$STATUS" == "200" ]] || fail "markWatched returned $STATUS"
curl -s -m 15 "$BASE/tv/94605/season/1" -b "$JAR2" -o /tmp/mw1.html
COUNT=$(body /tmp/mw1.html | grep -o "✓ Watched" | wc -l || true)
[[ "$COUNT" == "1" ]] || fail "markWatched did not mark the episode (found $COUNT)"

# A player reports completion more than once — a seek past the end, a replay, a
# duplicate message. This must stay one row, which is exactly why the action is
# markWatched (insert-if-absent) and not toggleWatched (which would un-watch).
STATUS=$(mark_via_client)
[[ "$STATUS" == "200" ]] || fail "second markWatched returned $STATUS"
curl -s -m 15 "$BASE/tv/94605/season/1" -b "$JAR2" -o /tmp/mw2.html
COUNT=$(body /tmp/mw2.html | grep -o "✓ Watched" | wc -l || true)
[[ "$COUNT" == "1" ]] || fail "a second completion event changed the count to $COUNT"
echo "ok  player completion action marks once and stays marked"
rm -f "$JAR2"

echo "ALL CHECKS PASSED"
