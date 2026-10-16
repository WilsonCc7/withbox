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

# Start from a known state. Local D1 persists across runs, so without this the
# suite inherits whatever the previous run left behind — which has already
# produced one false failure (a user identified by scraping a listing page).
# The script refuses any non-loopback host.
bash scripts/reset-local-db.sh "$BASE"

# Extract the hidden action field name for a server action, e.g. "toggleWatched".
action_for() {
  python3 scripts/find-action.py "$1" "$2"
}

# Visible text of a page, with the RSC payload stripped, for text assertions.
body() {
  python3 scripts/page-body.py "$1"
}

# POST one server action the way a no-JS browser would.
# Authenticates as $ACTJAR when set, else the primary $JAR — multi-user checks
# need to act as the second account, and silently using the first one is what
# made an earlier version of the social check look like a product bug.
post_action() {
  local url="$1" action="$2"
  shift 2
  local args=(-F "$action=")
  for kv in "$@"; do args+=(-F "$kv"); done
  curl -s -m 20 -X POST "$url" -b "${ACTJAR:-$JAR}" -c "${ACTJAR:-$JAR}" -H "Origin: $BASE" \
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

# --- source picker -------------------------------------------------------
# Every adapter that can serve a request is resolved so the viewer can escape
# one that is broken or slow. Framextv cannot serve TV at all, so it must not
# appear as an option there — offering a source that will fail is worse than
# offering none.
iframe_src() {
  python3 -c "
import re, sys
h = open(sys.argv[1]).read()
m = re.search(r'<iframe[^>]*src=\"([^\"]+)\"', h)
print(m.group(1).replace('&amp;', '&') if m else '')
" "$1"
}

WATCH="$BASE/watch/tv/94605?season=1&episode=1"
curl -s -m 15 "$WATCH" -b "$JAR" -o /tmp/src-default.html
DEF=$(iframe_src /tmp/src-default.html)
[[ "$DEF" == *vidlink.pro* ]] || fail "default TV source is not vidlink (got $DEF)"
grep -q "source=framextv" /tmp/src-default.html \
  && fail "framextv is offered for a TV episode it cannot play"

SWITCH=$(python3 -c "
import re
h = open('/tmp/src-default.html').read()
m = re.search(r'href=\"(/watch/tv/94605\?[^\"]*source=vidsrc[^\"]*)\"', h)
print(m.group(1).replace('&amp;', '&') if m else '')
")
[[ -n "$SWITCH" ]] || fail "no switch link to vidsrc"
[[ "$SWITCH" == *season=1* && "$SWITCH" == *episode=1* ]] \
  || fail "switch link lost the episode context: $SWITCH"

curl -s -m 15 "$BASE$SWITCH" -b "$JAR" -o /tmp/src-vidsrc.html
V=$(iframe_src /tmp/src-vidsrc.html)
[[ "$V" == *vidsrc* ]] || fail "?source=vidsrc did not switch provider (got $V)"
[[ "$V" != "$DEF" ]] || fail "?source=vidsrc rendered the same player as the default"
echo "ok  source picker switches provider and keeps the episode"

# A source that is unknown, or that cannot serve this request, must degrade to
# the default rather than turning a playable title into an error.
for q in "source=nonsense" "source=framextv" "source="; do
  curl -s -m 15 "$WATCH&$q" -b "$JAR" -o /tmp/src-fallback.html
  F=$(iframe_src /tmp/src-fallback.html)
  [[ "$F" == "$DEF" ]] || fail "?$q did not fall back to the default source (got $F)"
done
echo "ok  unknown and unsupported sources fall back to the default"

# Auto-advance must keep the chosen provider, or the next episode would
# silently come from somebody else.
python3 -c "
h = open('/tmp/src-default.html').read()
i = h.find('nextHref')
print(h[i:i + 160] if i >= 0 else 'NONE')
" > /tmp/nexthref.txt
grep -q 'episode=2' /tmp/nexthref.txt || fail "auto-advance link lost the episode"
grep -q 'source=vidlink' /tmp/nexthref.txt \
  || fail "auto-advance does not carry the source forward"
echo "ok  auto-advance carries the source forward"

# The auto-advance target for a watch URL, as the raw payload window around
# `nextHref`. Escaping is left alone; callers grep for substrings inside it.
next_window() {
  curl -s -m 15 "$1" -b "$JAR" -o /tmp/nh.html
  python3 -c "
h = open('/tmp/nh.html').read()
i = h.find('nextHref')
print(h[i:i + 160] if i >= 0 else 'NONE')
"
}

# Cross-season: the last episode of a season must advance into the NEXT season
# rather than ending the run at every season boundary.
CROSS=$(next_window "$BASE/watch/tv/94605?season=1&episode=9")
[[ "$CROSS" == *season=2* ]] || fail "Arcane S1E9 did not advance into season 2: $CROSS"
[[ "$CROSS" == *episode=1* ]] || fail "Arcane S1E9 did not land on episode 1: $CROSS"
echo "ok  the last episode of a season advances into the next season"

# The final episode of the final season ends the run.
curl -s -m 15 "$BASE/watch/tv/94605?season=2&episode=9" -b "$JAR" -o /tmp/last-ep.html
body /tmp/last-ep.html | grep -q "plays the next episode" \
  && fail "the final episode of the show still advertises a next episode"
echo "ok  the final episode of the show offers no next episode"

# Specials (season 0) must be skipped: advancing season 1 -> "specials" would be
# wrong, and a special has no episode order to continue.
SPECIALS=$(next_window "$BASE/watch/tv/1399?season=1&episode=10")
[[ "$SPECIALS" == *season=2* ]] || fail "Game of Thrones S1E10 did not advance to season 2: $SPECIALS"
[[ "$SPECIALS" == *season=0* ]] && fail "advance walked into the specials season"
echo "ok  advance skips the specials season"

# --- resume --------------------------------------------------------------
# The position is stored per slot, and only an adapter that reports position
# can be handed one back. `saveProgress` is passed as a PROP to the bridge, so
# like markWatched it has no hidden form field — its id comes from the payload.
curl -s -m 15 "$WATCH" -b "$JAR" -o /tmp/resume-probe.html
SAVE=$(python3 -c "
import re
s = open('/tmp/resume-probe.html').read()
m = re.search(r'id..:..([0-9a-f]{6,}#saveProgress)', s)
print(m.group(1) if m else '')
" || true)
[[ -n "$SAVE" ]] || fail "saveProgress action id absent from the watch page payload"

seed_progress() {
  local code
  # The payload carries the bare `hash#name`; the form field needs the
  # `$ACTION_ID_` prefix, which post_action does not add (find-action.py
  # returns the prefixed form, this extraction does not).
  code=$(ACTJAR="$JAR" post_action "$WATCH" "\$ACTION_ID_$SAVE" \
    kind=tv tmdbId=94605 season=1 episode=1 position="$1")
  [[ "$code" == "200" || "$code" == "303" ]] || fail "saveProgress returned $code"
}

seed_progress 900
curl -s -m 15 "$WATCH&source=vidsrc" -b "$JAR" -o /tmp/resume-vidsrc.html
RS=$(iframe_src /tmp/resume-vidsrc.html)
[[ "$RS" == *startAt=900* ]] || fail "vidsrc did not receive the resume position: $RS"
body /tmp/resume-vidsrc.html | grep -qi "resum" \
  || fail "no resume note shown for an adapter that honours it"

# vidlink reports position but has no documented resume parameter, so the page
# must neither pass one nor claim to be resuming.
curl -s -m 15 "$WATCH&source=vidlink" -b "$JAR" -o /tmp/resume-vidlink.html
RL=$(iframe_src /tmp/resume-vidlink.html)
[[ "$RL" != *startAt* ]] || fail "vidlink was handed a startAt it does not honour: $RL"
body /tmp/resume-vidlink.html | grep -qi "resum" \
  && fail "resume note shown for an adapter that ignores the position"

# Just past the opening titles is worse than starting over.
seed_progress 5
curl -s -m 15 "$WATCH&source=vidsrc" -b "$JAR" -o /tmp/resume-tiny.html
RT=$(iframe_src /tmp/resume-tiny.html)
[[ "$RT" != *startAt* ]] || fail "a 5-second position was treated as resumable: $RT"
echo "ok  resume is honoured only by adapters that support it, and only past the floor"

# --- the upsert must not duplicate rows ----------------------------------
# `slotKey` exists precisely because SQLite treats NULLs as DISTINCT in a
# unique index: for a film (season and episode both NULL) an index on the raw
# columns would never collide, so every save would insert another row and the
# "resume" would read back whichever one won. This asserts the property the
# design decision was made for, by reading the table directly.
db_scalar() {
  python3 - "$BASE" "$1" <<'PY'
import json, sys, urllib.request
base, sql = sys.argv[1], sys.argv[2]
api = f"{base}/cdn-cgi/local/explorer/api"


def call(path, payload=None, method="GET"):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        api + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)


uuid = call("/d1/database")["result"][0]["uuid"]
res = call(f"/d1/database/{uuid}/raw", {"batch": [{"sql": sql}]}, "POST")
print(res["result"][0]["results"]["rows"][0][0])
PY
}

EP_SLOT="kind='tv' AND tmdbId=94605 AND season=1 AND episode=1"
seed_progress 900
seed_progress 1200
COUNT=$(db_scalar "SELECT COUNT(*) FROM playback_progress WHERE $EP_SLOT")
[[ "$COUNT" == "1" ]] || fail "two saves for one episode slot produced $COUNT rows"
POS=$(db_scalar "SELECT positionSeconds FROM playback_progress WHERE $EP_SLOT")
[[ "$POS" == "1200" ]] || fail "stored position is $POS, expected the newest (1200)"
echo "ok  repeated saves for one episode slot upsert to one row, newest wins"

# Two saves for a FILM slot: season and episode are both NULL here.
ACTJAR="$JAR" post_action "$BASE/watch/movie/550" "\$ACTION_ID_$SAVE" \
  kind=movie tmdbId=550 position=600 >/dev/null
ACTJAR="$JAR" post_action "$BASE/watch/movie/550" "\$ACTION_ID_$SAVE" \
  kind=movie tmdbId=550 position=700 >/dev/null
FCOUNT=$(db_scalar "SELECT COUNT(*) FROM playback_progress WHERE kind='movie' AND tmdbId=550")
[[ "$FCOUNT" == "1" ]] || fail "two saves for one film slot produced $FCOUNT rows — the NULL slot collided"
FPOS=$(db_scalar "SELECT positionSeconds FROM playback_progress WHERE kind='movie' AND tmdbId=550")
[[ "$FPOS" == "700" ]] || fail "film position is $FPOS, expected the newest (700)"
echo "ok  a film slot with NULL season/episode also upserts to one row"
rm -f "$JAR2"

# --- social: follows, feed, lists ----------------------------------------
# Needs a second account: following is only meaningful between two users.
JAR2="$(mktemp)"
curl -s -m 20 -X POST "$BASE/api/auth/sign-up/email" -H "Content-Type: application/json" \
  -H "Origin: $BASE" -d "{\"email\":\"social-$(date +%s)@example.com\",\"password\":\"$PASS\",\"name\":\"Follower\"}" \
  -c "$JAR2" -o /tmp/signup2.json
UID2=$(python3 -c "import json;print(json.load(open('/tmp/signup2.json'))['user']['id'])" 2>/dev/null || true)
[[ -n "$UID2" ]] || fail "could not read the second user's id from sign-up"

# Discoverability: without /people the social graph is unreachable.
curl -s -m 15 "$BASE/people" -b "$JAR2" -o /tmp/people.html
body /tmp/people.html | grep -q "Loop" || fail "/people does not list the first user"
# The header renders the signed-in user's own name, so a text check would match
# it. Assert on the profile LINK instead, scoped to <main>: the mobile tab bar
# legitimately links to the viewer's own profile ("You"), but the LISTING must
# not include them.
python3 - <<PY || fail "/people links to the viewer's own profile"
import re, sys
h = open("/tmp/people.html").read()
main = re.search(r"<main\b.*?</main>", h, re.S)
sys.exit(1 if main and "/u/$UID2" in main.group(0) else 0)
PY
# Take the id from the original sign-up response rather than scraping the first
# profile link off /people. The local D1 accumulates accounts across runs, so
# /people lists many users alphabetically and the first link belongs to some
# earlier run's account — which has no activity for the feed to show.
UID1=$(python3 -c "import json;print(json.load(open('/tmp/loop-signup.json'))['user']['id'])" 2>/dev/null || true)
[[ -n "$UID1" ]] || fail "could not read the first user's id from sign-up"
echo "ok  /people lists other users and not the viewer"

# Everything below acts as the SECOND user. Without this, post_action would
# authenticate as the first user and the "follow" would be a self-follow.
ACTJAR="$JAR2"

# Follow, then the feed must carry the followed user's activity.
curl -s -m 15 "$BASE/u/$UID1" -b "$JAR2" -o /tmp/prof1.html
FOLLOW=$(action_for /tmp/prof1.html follow)
[[ -n "$FOLLOW" ]] || fail "no follow action on the profile page"
STATUS=$(post_action "$BASE/u/$UID1" "$FOLLOW" userId="$UID1")
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "follow returned $STATUS"

curl -s -m 15 "$BASE/feed" -b "$JAR2" -o /tmp/feed.html
body /tmp/feed.html | grep -q "Fight Club" || fail "feed does not show the followed user's activity"
echo "ok  follow works and the feed shows followed activity"

# Following twice must not double-count, and self-follow must be refused.
STATUS=$(post_action "$BASE/u/$UID1" "$FOLLOW" userId="$UID1")
STATUS2=$(post_action "$BASE/u/$UID1" "$FOLLOW" userId="$UID2")
curl -s -m 15 "$BASE/u/$UID2" -b "$JAR2" -o /tmp/prof2.html
body /tmp/prof2.html | grep -q "1 following" \
  || fail "following count is not 1 after a duplicate follow and a self-follow"
echo "ok  follow is idempotent and self-follow is refused"

# --- lists ---------------------------------------------------------------
curl -s -m 15 "$BASE/lists" -b "$JAR2" -o /tmp/lists.html
body /tmp/lists.html | grep -qi "no lists yet" || fail "/lists shows no empty state"
CL=$(action_for /tmp/lists.html createList)
[[ -n "$CL" ]] || fail "no createList action on /lists"
STATUS=$(post_action "$BASE/lists" "$CL" name="Comfort films")
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "createList returned $STATUS"

curl -s -m 15 "$BASE/lists" -b "$JAR2" -o /tmp/lists2.html
body /tmp/lists2.html | grep -q "Comfort films" || fail "created list is not listed"
LID=$(python3 -c "
import re
h = open('/tmp/lists2.html').read()
m = re.search(r'/lists/([A-Za-z0-9_-]+)', h)
print(m.group(1) if m else '')
" || true)
[[ -n "$LID" ]] || fail "no list link found on /lists"
echo "ok  list created and listed"

# Add a title from the film page — this is the only route into a list.
curl -s -m 15 "$BASE/movie/550" -b "$JAR2" -o /tmp/film-add.html
ADD=$(action_for /tmp/film-add.html addToList)
[[ -n "$ADD" ]] || fail "no addToList action on the film page"
grep -q 'name="listId"' /tmp/film-add.html || fail "film page has no list picker"
STATUS=$(post_action "$BASE/movie/550" "$ADD" listId="$LID" kind=movie tmdbId=550)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "addToList returned $STATUS"

curl -s -m 15 "$BASE/lists/$LID" -b "$JAR2" -o /tmp/list-detail.html
body /tmp/list-detail.html | grep -q "Fight Club" || fail "added title is not on the list"
echo "ok  title added to list and shown"

# A non-owner must see no add/remove/delete controls at all.
curl -s -m 15 "$BASE/lists/$LID" -b "$JAR" -o /tmp/list-other.html
body /tmp/list-other.html | grep -q "Comfort films" || fail "a non-owner cannot read the list"
body /tmp/list-other.html | grep -q "Delete list" && fail "a non-owner is offered Delete list"
echo "ok  list is readable by others but not editable"

# Removal.
RM=$(action_for /tmp/list-detail.html removeFromList)
[[ -n "$RM" ]] || fail "no removeFromList action on the owner's list page"
STATUS=$(post_action "$BASE/lists/$LID" "$RM" listId="$LID" kind=movie tmdbId=550)
curl -s -m 15 "$BASE/lists/$LID" -b "$JAR2" -o /tmp/list-after.html
body /tmp/list-after.html | grep -q "Fight Club" && fail "removed title is still on the list"
echo "ok  title removed from list"

# --- pagination robustness -----------------------------------------------
# A hand-edited or stale cursor must degrade to the first page, never 500 and
# never an error page. These are the failure modes a user actually hits by
# editing the URL or following a bookmarked link after the data moved.
curl -s -m 15 "$BASE/feed" -b "$JAR2" -o /tmp/pg-feed.html
body /tmp/pg-feed.html > /tmp/pg-feed-base.txt
for q in "before=abc" "before=999-" "before=-1" "before="; do
  CODE=$(curl -s -m 15 "$BASE/feed?$q" -b "$JAR2" -o /tmp/pg-f.html -w '%{http_code}')
  [[ "$CODE" == "200" ]] || fail "/feed?$q returned $CODE"
  body /tmp/pg-f.html > /tmp/pg-f.txt
  diff -q /tmp/pg-feed-base.txt /tmp/pg-f.txt >/dev/null \
    || fail "/feed?$q did not fall back to the first page"
done
echo "ok  /feed falls back to the first page on a junk cursor"

# A well-formed but absurd cursor is NOT junk: it parses, so it is accepted and
# simply selects every row. It must return a real page, not an error.
CODE=$(curl -s -m 15 "$BASE/feed?before=999999999999999-x" -b "$JAR2" -o /tmp/pg-f2.html -w '%{http_code}')
[[ "$CODE" == "200" ]] || fail "/feed with a far-future cursor returned $CODE"
body /tmp/pg-f2.html | grep -q "watched" \
  || fail "/feed with a far-future cursor returned no rows"
echo "ok  /feed accepts a well-formed far-future cursor"

curl -s -m 15 "$BASE/people" -b "$JAR2" -o /tmp/pg-people.html
body /tmp/pg-people.html > /tmp/pg-people-base.txt
for q in "page=abc" "page=0" "page=-1" "page=1.5" "page=" "page=99999"; do
  CODE=$(curl -s -m 15 "$BASE/people?$q" -b "$JAR2" -o /tmp/pg-p.html -w '%{http_code}')
  [[ "$CODE" == "200" ]] || fail "/people?$q returned $CODE"
done
for q in "page=abc" "page=0" "page=-1" "page=1.5" "page="; do
  curl -s -m 15 "$BASE/people?$q" -b "$JAR2" -o /tmp/pg-p.html
  body /tmp/pg-p.html > /tmp/pg-p.txt
  diff -q /tmp/pg-people-base.txt /tmp/pg-p.txt >/dev/null \
    || fail "/people?$q did not fall back to page 1"
done
echo "ok  /people falls back to page 1 on a junk page value"

# The library pages are now bounded by the page size, so they take a page
# number too and must degrade the same way. NOTE: engagement cannot be tested
# here — the fixture catalogue holds only 20 titles, well under the 60-row page
# size, so no second page of /watched can be produced with fixture data.
for path in watched watchlist; do
  curl -s -m 15 "$BASE/$path" -b "$JAR" -o /tmp/lib-base.html
  body /tmp/lib-base.html > /tmp/lib-base.txt
  for q in "page=abc" "page=0" "page=-1" "page=1.5" "page="; do
    CODE=$(curl -s -m 15 "$BASE/$path?$q" -b "$JAR" -o /tmp/lib-x.html -w '%{http_code}')
    [[ "$CODE" == "200" ]] || fail "/$path?$q returned $CODE"
    body /tmp/lib-x.html > /tmp/lib-x.txt
    diff -q /tmp/lib-base.txt /tmp/lib-x.txt >/dev/null \
      || fail "/$path?$q did not fall back to the first page"
  done
  # A huge page number is valid input; it must render, not throw.
  CODE=$(curl -s -m 15 "$BASE/$path?page=99999" -b "$JAR" -o /dev/null -w '%{http_code}')
  [[ "$CODE" == "200" ]] || fail "/$path?page=99999 returned $CODE"
done
echo "ok  /watched and /watchlist tolerate junk page values"

# The profile's watched grid is paged too. Its cap used to be a silent 24 with
# no way to reach the rest.
curl -s -m 15 "$BASE/u/$UID1" -b "$JAR" -o /tmp/prof-base.html
body /tmp/prof-base.html > /tmp/prof-base.txt
for q in "page=abc" "page=0" "page=-1" "page=1.5" "page="; do
  CODE=$(curl -s -m 15 "$BASE/u/$UID1?$q" -b "$JAR" -o /tmp/prof-x.html -w '%{http_code}')
  [[ "$CODE" == "200" ]] || fail "/u/<id>?$q returned $CODE"
  body /tmp/prof-x.html > /tmp/prof-x.txt
  diff -q /tmp/prof-base.txt /tmp/prof-x.txt >/dev/null \
    || fail "/u/<id>?$q did not fall back to page 1"
done
CODE=$(curl -s -m 15 "$BASE/u/$UID1?page=99999" -b "$JAR" -o /dev/null -w '%{http_code}')
[[ "$CODE" == "200" ]] || fail "/u/<id>?page=99999 returned $CODE"
echo "ok  /u/[id] tolerates junk page values"

# Page 2 must not repeat page 1, and must not be an error page.
CODE=$(curl -s -m 15 "$BASE/people?page=2" -b "$JAR2" -o /tmp/pg-p2.html -w '%{http_code}')
[[ "$CODE" == "200" ]] || fail "/people?page=2 returned $CODE"
echo "ok  /people?page=2 renders"

# --- pagination actually engages -----------------------------------------
# The robustness checks above only prove junk input is tolerated. This seeds a
# KNOWN number of activities for a fresh account and proves the pages partition
# them exactly: 37 items -> page 1 carries 30 and offers Older, page 2 carries
# the remaining 7 and offers nothing further. Summing both pages is what proves
# neither a skip (total < 37) nor a repeat (total > 37) at the boundary — which
# is the failure a timestamp-only cursor would produce, because a whole-season
# mark writes every row with the SAME watchedAt.
JAR3="$(mktemp)"
curl -s -m 20 -X POST "$BASE/api/auth/sign-up/email" -H "Content-Type: application/json" \
  -H "Origin: $BASE" -d "{\"email\":\"pager-$(date +%s)@example.com\",\"password\":\"$PASS\",\"name\":\"Pager\"}" \
  -c "$JAR3" -o /dev/null

seed_action() {
  local url="$1" act="$2"
  shift 2
  local code
  code=$(ACTJAR="$JAR3" post_action "$url" "$act" "$@")
  [[ "$code" == "200" || "$code" == "303" ]] || fail "seed action returned $code"
}

# One POST marks a whole season; 34 episode rows across four seasons.
mark_all_episodes() {
  local tv="$1" season="$2" count="$3"
  local eps
  eps=$(seq -s, 1 "$count")
  curl -s -m 15 "$BASE/tv/$tv/season/$season" -b "$JAR3" -o /tmp/seed-season.html
  local act
  act=$(action_for /tmp/seed-season.html markSeason)
  [[ -n "$act" ]] || fail "no markSeason action on /tv/$tv/season/$season"
  seed_action "$BASE/tv/$tv/season/$season" "$act" \
    tmdbId="$tv" season="$season" episodes="$eps"
}

mark_all_episodes 94605 1 9
mark_all_episodes 94605 2 9
mark_all_episodes 82856 1 8
mark_all_episodes 82856 2 8

# Three more single activities: a film watch, a rating and a review.
curl -s -m 15 "$BASE/movie/550" -b "$JAR3" -o /tmp/seed-film.html
seed_action "$BASE/movie/550" "$(action_for /tmp/seed-film.html toggleWatched)" kind=movie tmdbId=550
seed_action "$BASE/movie/550" "$(action_for /tmp/seed-film.html setRating)" kind=movie tmdbId=550 value=8
seed_action "$BASE/movie/550" "$(action_for /tmp/seed-film.html setReview)" kind=movie tmdbId=550 body="Pagination seed."

# Every row renders exactly one ISO date, so counting dates counts rows.
count_rows() {
  body "$1" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | wc -l || true
}
has_older() {
  grep -qE 'href="/feed\?before=' "$1"
}

curl -s -m 15 "$BASE/feed" -b "$JAR3" -o /tmp/pg1.html
P1=$(count_rows /tmp/pg1.html)
[[ "$P1" == "30" ]] || fail "feed page 1 has $P1 rows, expected 30"
has_older /tmp/pg1.html || fail "feed page 1 does not offer an Older link"

OLDER=$(python3 -c "
import re
h = open('/tmp/pg1.html').read()
m = re.search(r'href=\"(/feed\?before=[^\"]+)\"', h)
print(m.group(1).replace('&amp;', '&') if m else '')
" || true)
[[ -n "$OLDER" ]] || fail "could not read the Older link href"

curl -s -m 15 "$BASE$OLDER" -b "$JAR3" -o /tmp/pg2.html
P2=$(count_rows /tmp/pg2.html)
has_older /tmp/pg2.html && fail "the last feed page still offers an Older link"

TOTAL=$((P1 + P2))
[[ "$TOTAL" == "37" ]] || fail "the two pages covered $TOTAL rows, expected 37 (skip or repeat at the boundary)"
echo "ok  feed partitions 37 activities into 30 + $P2 with no skip or repeat"

# --- feed JSON API -------------------------------------------------------
# The load-more button reads this route. It must partition the feed exactly the
# way the server-rendered page does — a cursor that skips or repeats a row at
# the boundary would look fine in the HTML and be wrong only after hydration.
CODE=$(curl -s -m 15 "$BASE/api/feed" -b "$JAR3" -o /tmp/feed-api1.json -w '%{http_code}')
[[ "$CODE" == "200" ]] || fail "/api/feed returned $CODE"
python3 - <<'PY' || fail "/api/feed page 1 does not carry the 30 rows the HTML page shows"
import json
d = json.load(open("/tmp/feed-api1.json"))
assert len(d["rows"]) == 30, len(d["rows"])
assert d["next"], "page 1 offers no cursor"
assert all(r.get("title") for r in d["rows"]), "a row has no title"
PY
NEXT=$(python3 -c "import json;print(json.load(open('/tmp/feed-api1.json'))['next'])")
CODE=$(curl -s -m 15 "$BASE/api/feed?before=$NEXT" -b "$JAR3" -o /tmp/feed-api2.json -w '%{http_code}')
[[ "$CODE" == "200" ]] || fail "/api/feed?before=<cursor> returned $CODE"
python3 - <<'PY' || fail "/api/feed did not finish the feed (7 rows, no further cursor)"
import json
d = json.load(open("/tmp/feed-api2.json"))
assert len(d["rows"]) == 7, len(d["rows"])
assert d["next"] is None, d["next"]
PY
CODE=$(curl -s -m 15 "$BASE/api/feed" -o /dev/null -w '%{http_code}')
[[ "$CODE" == "401" ]] || fail "signed-out /api/feed returned $CODE, expected 401"
echo "ok  /api/feed pages exactly like the server feed and refuses signed-out callers"
rm -f "$JAR3"

# --- diary: logging a watch ----------------------------------------------
# One log = one watch_entry row. The rating and review on the same form are
# title-level upserts, so logging twice must not duplicate those either.
ACTJAR="$JAR"
curl -s -m 15 "$BASE/movie/550" -b "$JAR" -o /tmp/diary-film.html
LOG=$(action_for /tmp/diary-film.html logWatch)
[[ -n "$LOG" ]] || fail "no logWatch action on the film page"

STATUS=$(post_action "$BASE/movie/550" "$LOG" kind=movie tmdbId=550 watchedAt=2020-05-04)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "logWatch returned $STATUS"

curl -s -m 15 "$BASE/diary" -b "$JAR" -o /tmp/diary1.html
body /tmp/diary1.html | grep -q "Fight Club" || fail "/diary does not list the logged film"
body /tmp/diary1.html | grep -q "2020-05-04" || fail "/diary does not show the logged date"
echo "ok  logWatch stores an entry and /diary renders it"

STATUS=$(post_action "$BASE/movie/550" "$LOG" kind=movie tmdbId=550 watchedAt=2020-05-05)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "the second logWatch returned $STATUS"
curl -s -m 15 "$BASE/diary" -b "$JAR" -o /tmp/diary2.html
# Every diary row renders exactly one ISO date, so counting dates counts rows.
ROWS1=$(count_rows /tmp/diary1.html)
ROWS2=$(count_rows /tmp/diary2.html)
[[ "$ROWS2" == "$((ROWS1 + 1))" ]] \
  || fail "a second log added $((ROWS2 - ROWS1)) diary rows, expected exactly 1"
body /tmp/diary2.html | grep -q "Rewatch" || fail "the repeat viewing is not flagged as a rewatch"
echo "ok  a second log adds one row and is flagged as a rewatch"

DEL=$(action_for /tmp/diary2.html deleteWatchEntry)
[[ -n "$DEL" ]] || fail "no deleteWatchEntry action on /diary"
ENTRY=$(python3 -c "
import re
h = open('/tmp/diary2.html').read()
tags = re.findall(r'<input[^>]*name=\"entryId\"[^>]*>', h)
v = re.search(r'value=\"([^\"]+)\"', tags[0]) if tags else None
print(v.group(1) if v else '')
")
[[ -n "$ENTRY" ]] || fail "no entryId hidden field on /diary"
STATUS=$(post_action "$BASE/diary" "$DEL" entryId="$ENTRY")
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "deleteWatchEntry returned $STATUS"
curl -s -m 15 "$BASE/diary" -b "$JAR" -o /tmp/diary3.html
ROWS3=$(count_rows /tmp/diary3.html)
[[ "$ROWS3" == "$((ROWS2 - 1))" ]] \
  || fail "deleteWatchEntry removed $((ROWS2 - ROWS3)) rows, expected exactly 1"
# The other row for the same title survives, so the title stays watched.
curl -s -m 15 "$BASE/watched" -b "$JAR" -o /tmp/watched-after-diary.html
body /tmp/watched-after-diary.html | grep -q "Fight Club" \
  || fail "removing one diary row unwatched a title that still has another row"
echo "ok  deleteWatchEntry removes exactly one row and leaves the title watched"

# --- likes and favourites ------------------------------------------------
LIKE=$(action_for /tmp/diary-film.html toggleLiked)
[[ -n "$LIKE" ]] || fail "no toggleLiked action on the film page"
STATUS=$(post_action "$BASE/movie/550" "$LIKE" kind=movie tmdbId=550)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "toggleLiked returned $STATUS"
curl -s -m 15 "$BASE/u/$UID1" -b "$JAR" -o /tmp/prof-self.html
body /tmp/prof-self.html | grep -q "Liked" || fail "the profile renders no liked section"
echo "ok  toggleLiked records a like the profile renders"

FAV=$(action_for /tmp/diary-film.html setFavorite)
[[ -n "$FAV" ]] || fail "no setFavorite action on the film page"
STATUS=$(post_action "$BASE/movie/550" "$FAV" kind=movie tmdbId=550 slot=0)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "setFavorite returned $STATUS"
curl -s -m 15 "$BASE/movie/550" -b "$JAR" -o /tmp/fav-pinned.html
body /tmp/fav-pinned.html | grep -q "Slot 1" || fail "the favourite slots are not offered"
body /tmp/fav-pinned.html | grep -q "remove" || fail "pinning a slot did not mark it occupied"
STATUS=$(post_action "$BASE/movie/550" "$FAV" kind=movie tmdbId=550 slot=0)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "the second setFavorite returned $STATUS"
curl -s -m 15 "$BASE/movie/550" -b "$JAR" -o /tmp/fav-cleared.html
body /tmp/fav-cleared.html | grep -q "empty" || fail "re-pinning the same title did not clear the slot"
echo "ok  setFavorite pins a slot, and calling it again clears it"

# --- list editing --------------------------------------------------------
ACTJAR="$JAR2"
curl -s -m 15 "$BASE/movie/550" -b "$JAR2" -o /tmp/readd-film.html
ADD=$(action_for /tmp/readd-film.html addToList)
STATUS=$(post_action "$BASE/movie/550" "$ADD" listId="$LID" kind=movie tmdbId=550)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "re-adding the film returned $STATUS"
curl -s -m 15 "$BASE/tv/94605" -b "$JAR2" -o /tmp/readd-tv.html
ADDTV=$(action_for /tmp/readd-tv.html addToList)
[[ -n "$ADDTV" ]] || fail "no addToList action on the series page"
STATUS=$(post_action "$BASE/tv/94605" "$ADDTV" listId="$LID" kind=tv tmdbId=94605)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "adding the series returned $STATUS"

order_ok() {
  python3 -c "
import sys
h = open('$1').read()
a, b = h.find('$2'), h.find('$3')
sys.exit(0 if a != -1 and b != -1 and a < b else 1)
"
}

curl -s -m 15 "$BASE/lists/$LID" -b "$JAR2" -o /tmp/list-two.html
order_ok /tmp/list-two.html "/movie/550" "/tv/94605" \
  || fail "two added titles are not in insertion order"

MOVE=$(action_for /tmp/list-two.html moveListItem)
[[ -n "$MOVE" ]] || fail "no moveListItem action on an owned list"
# The last itemId input belongs to the second row (both rows are position-ordered).
ITEM=$(python3 -c "
import re
h = open('/tmp/list-two.html').read()
tags = re.findall(r'<input[^>]*name=\"itemId\"[^>]*>', h)
v = re.search(r'value=\"([^\"]+)\"', tags[-1]) if tags else None
print(v.group(1) if v else '')
")
[[ -n "$ITEM" ]] || fail "no itemId hidden field on the list page"
STATUS=$(post_action "$BASE/lists/$LID" "$MOVE" itemId="$ITEM" direction=up)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "moveListItem returned $STATUS"
curl -s -m 15 "$BASE/lists/$LID" -b "$JAR2" -o /tmp/list-moved.html
order_ok /tmp/list-moved.html "/tv/94605" "/movie/550" || fail "moveListItem did not swap the entries"
echo "ok  moveListItem reorders a list in one swap"

RENAME=$(action_for /tmp/list-two.html renameList)
[[ -n "$RENAME" ]] || fail "no renameList action on an owned list"
STATUS=$(post_action "$BASE/lists/$LID" "$RENAME" listId="$LID" name="Renamed films" description="Edited")
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "renameList returned $STATUS"
curl -s -m 15 "$BASE/lists/$LID" -b "$JAR2" -o /tmp/list-renamed.html
body /tmp/list-renamed.html | grep -q "Renamed films" || fail "renameList did not rename the list"
body /tmp/list-renamed.html | grep -q "Edited" || fail "renameList did not store the description"
echo "ok  renameList updates the name and description"

# --- avatar upload -------------------------------------------------------
ACTJAR="$JAR"
curl -s -m 15 "$BASE/settings" -b "$JAR" -o /tmp/settings.html
AV=$(action_for /tmp/settings.html uploadAvatar)
[[ -n "$AV" ]] || fail "no uploadAvatar action on /settings"
# The smallest valid PNG (1x1), built here so no binary fixture is committed.
python3 -c "
import base64, pathlib
pathlib.Path('/tmp/avatar.png').write_bytes(base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='))
"
STATUS=$(curl -s -m 20 -X POST "$BASE/settings" -b "$JAR" -c "$JAR" -H "Origin: $BASE" \
  -F "$AV=" -F "avatar=@/tmp/avatar.png;type=image/png" -o /dev/null -w '%{http_code}')
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "uploadAvatar returned $STATUS"

# `uploadAvatar` returns without writing when no bucket is bound, so an empty
# column means "no R2 locally" rather than a failed upload. A stored path that
# the route cannot serve is a real failure and must be caught.
IMG=$(db_scalar "SELECT image FROM user WHERE id = '$UID1'")
if [[ "$IMG" == "None" || -z "$IMG" ]]; then
  echo "skip  avatar upload: no local R2 binding (the action returns silently by design)"
else
  CODE=$(curl -s -m 15 "$BASE/api/avatar/$UID1" -D /tmp/avatar-head.txt -o /tmp/avatar-out.png -w '%{http_code}')
  [[ "$CODE" == "200" ]] || fail "/api/avatar/$UID1 returned $CODE for a stored image"
  grep -qi '^content-type: image/png' /tmp/avatar-head.txt \
    || fail "the avatar route served the wrong content type"
  cmp -s /tmp/avatar.png /tmp/avatar-out.png || fail "avatar bytes do not round-trip through R2"
  echo "ok  avatar uploads to R2 and round-trips through /api/avatar"
fi

# --- library filters and sort --------------------------------------------
CODE=$(curl -s -m 15 "$BASE/watched?kind=movie&sort=rating" -b "$JAR" -o /tmp/w-movie.html -w '%{http_code}')
[[ "$CODE" == "200" ]] || fail "/watched?kind=movie&sort=rating returned $CODE"
body /tmp/w-movie.html | grep -q "Fight Club" || fail "the film filter dropped the watched film"
CODE=$(curl -s -m 15 "$BASE/watched?kind=tv" -b "$JAR" -o /tmp/w-tv.html -w '%{http_code}')
[[ "$CODE" == "200" ]] || fail "/watched?kind=tv returned $CODE"
body /tmp/w-tv.html | grep -q "Fight Club" && fail "/watched?kind=tv still lists the watched film"
CODE=$(curl -s -m 15 "$BASE/watchlist?kind=tv" -b "$JAR" -o /dev/null -w '%{http_code}')
[[ "$CODE" == "200" ]] || fail "/watchlist?kind=tv returned $CODE"
echo "ok  the kind filters and the rating sort narrow the grids"

# --- a fractional playhead is stored, not dropped ------------------------
# The live bridge forwards the provider's currentTime verbatim, so a
# `timeupdate` really does report 42.5. The parse used to reject anything that
# was not an integer and return without writing, which read as "resume is
# broken" for every player that ticks in fractions.
ACTJAR="$JAR" post_action "$BASE/watch/movie/550" "\$ACTION_ID_$SAVE" \
  kind=movie tmdbId=550 position=42.5 duration=5400 >/dev/null
FPOS=$(db_scalar "SELECT positionSeconds FROM playback_progress WHERE kind='movie' AND tmdbId=550")
[[ "$FPOS" == "43" ]] || fail "a fractional position stored $FPOS, expected 43"
echo "ok  a fractional playback position is rounded and stored"

# --- a stored position prefers a source that can report progress ---------
# framextv cannot send playback back, so a film with a saved position used to
# open there and the bridge was never mounted: neither resume nor saving
# happened. With a position and no ?source=, the page must choose one that can.
curl -s -m 15 "$BASE/watch/movie/550" -b "$JAR" -o /tmp/resume-film.html
RF=$(iframe_src /tmp/resume-film.html)
[[ "$RF" == *vidsrc* ]] || fail "a resumable film did not pick a progress-capable source (got $RF)"
body /tmp/resume-film.html | grep -qi "resum" || fail "the resume-aware film page shows no resume note"

# Without a stored position the film default must stay framextv: preferResume
# is for continuing, not for reordering a fresh start, and an explicit choice
# still outranks both. RETURNING makes the delete readable through db_scalar.
db_scalar "DELETE FROM playback_progress WHERE kind='movie' AND tmdbId=550 RETURNING 1" >/dev/null
curl -s -m 15 "$BASE/watch/movie/550" -b "$JAR" -o /tmp/fresh-film.html
FF=$(iframe_src /tmp/fresh-film.html)
[[ "$FF" == *framextv* ]] || fail "a fresh film did not default to framextv (got $FF)"
echo "ok  a saved position prefers a resumable source, a fresh film keeps the default"

# Leave the film mid-watch for the continue-watching check at the end.
ACTJAR="$JAR" post_action "$BASE/watch/movie/550" "\$ACTION_ID_$SAVE" \
  kind=movie tmdbId=550 position=600 duration=5000 >/dev/null

# --- a different favourite slot moves the title --------------------------
# Same slot toggles off; a DIFFERENT slot used to delete the row instead of
# moving it, so re-pinning a favourite elsewhere silently removed it.
FAV=$(action_for /tmp/fav-cleared.html setFavorite)
[[ -n "$FAV" ]] || fail "no setFavorite action on the film page"
STATUS=$(post_action "$BASE/movie/550" "$FAV" kind=movie tmdbId=550 slot=0)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "setFavorite slot 0 returned $STATUS"
STATUS=$(post_action "$BASE/movie/550" "$FAV" kind=movie tmdbId=550 slot=2)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "setFavorite slot 2 returned $STATUS"
FPOS=$(db_scalar "SELECT position FROM favorite WHERE userId='$UID1' AND kind='movie' AND tmdbId=550")
[[ "$FPOS" == "2" ]] || fail "moving the favourite left it at slot $FPOS, expected 2"
FROWS=$(db_scalar "SELECT COUNT(*) FROM favorite WHERE userId='$UID1'")
[[ "$FROWS" == "1" ]] || fail "the move left $FROWS favourite rows, expected 1"
# The same slot again is a toggle off, and leaves nothing behind.
STATUS=$(post_action "$BASE/movie/550" "$FAV" kind=movie tmdbId=550 slot=2)
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "clearing favourite slot 2 returned $STATUS"
FROWS=$(db_scalar "SELECT COUNT(*) FROM favorite WHERE userId='$UID1'")
[[ "$FROWS" == "0" ]] || fail "re-pinning the same slot left $FROWS favourite rows, expected 0"
echo "ok  a different favourite slot moves the title, the same slot clears it"

# --- a double submit cannot duplicate a row ------------------------------
# Every insert is preceded by a "does it exist" read, so two overlapping
# submissions both see nothing and both write. These actions are
# insert-if-absent, so after a double submit exactly one row is correct.
# (The toggles are not tested this way: a toggle legitimately ends at zero.)
race_post() { # url action kv... — two concurrent POSTs, both codes on stdout
  local url="$1" action="$2"; shift 2
  local args=(-F "$action=")
  for kv in "$@"; do args+=(-F "$kv"); done
  local f1 f2 p1 p2
  f1=$(mktemp); f2=$(mktemp)
  curl -s -m 20 -X POST "$url" -b "$JAR4" -H "Origin: $BASE" "${args[@]}" \
    -o /dev/null -w '%{http_code}\n' > "$f1" &
  p1=$!
  curl -s -m 20 -X POST "$url" -b "$JAR4" -H "Origin: $BASE" "${args[@]}" \
    -o /dev/null -w '%{http_code}\n' > "$f2" &
  p2=$!
  # Wait on these two PIDs, never a bare `wait`: the script's own preview
  # server is a background job of this shell, and a bare `wait` inside a
  # command substitution tries to reap it forever.
  wait "$p1" || true
  wait "$p2" || true
  cat "$f1" "$f2"
  rm -f "$f1" "$f2"
}

JAR4="$(mktemp)"
curl -s -m 20 -X POST "$BASE/api/auth/sign-up/email" -H "Content-Type: application/json" \
  -H "Origin: $BASE" -d "{\"email\":\"race-$(date +%s)@example.com\",\"password\":\"$PASS\",\"name\":\"Race\"}" \
  -c "$JAR4" -o /tmp/signup4.json
UID4=$(python3 -c "import json;print(json.load(open('/tmp/signup4.json'))['user']['id'])" 2>/dev/null || true)
[[ -n "$UID4" ]] || fail "could not read the fourth user's id from sign-up"

CODES=$(race_post "$BASE/u/$UID1" "$FOLLOW" userId="$UID1")
[[ "$(printf '%s\n' $CODES | grep -c '^200$')" == "2" ]] \
  || fail "two concurrent follows returned: $(echo $CODES)"
ROWS=$(db_scalar "SELECT COUNT(*) FROM follow WHERE followerId='$UID4' AND followingId='$UID1'")
[[ "$ROWS" == "1" ]] || fail "two concurrent follows left $ROWS rows, expected 1"

curl -s -m 15 "$BASE/lists" -b "$JAR4" -o /tmp/race-lists.html
CL4=$(action_for /tmp/race-lists.html createList)
# post_action authenticates as $ACTJAR, which is still the primary user at this
# point — without this the list would be created for the wrong account and the
# race user's /lists would show nothing.
ACTJAR="$JAR4"
STATUS=$(post_action "$BASE/lists" "$CL4" name="Race list")
[[ "$STATUS" == "200" || "$STATUS" == "303" ]] || fail "createList for the race user returned $STATUS"
curl -s -m 15 "$BASE/lists" -b "$JAR4" -o /tmp/race-lists2.html
LID4=$(python3 -c "
import re
h = open('/tmp/race-lists2.html').read()
m = re.search(r'/lists/([A-Za-z0-9_-]+)', h)
print(m.group(1) if m else '')
" || true)
[[ -n "$LID4" ]] || fail "no list link found for the race user"
curl -s -m 15 "$BASE/movie/550" -b "$JAR4" -o /tmp/race-film.html
ADD4=$(action_for /tmp/race-film.html addToList)
[[ -n "$ADD4" ]] || fail "no addToList action on the film page"
CODES=$(race_post "$BASE/movie/550" "$ADD4" listId="$LID4" kind=movie tmdbId=550)
[[ "$(printf '%s\n' $CODES | grep -c '^200$')" == "2" ]] \
  || fail "two concurrent addToList calls returned: $(echo $CODES)"
ROWS=$(db_scalar "SELECT COUNT(*) FROM list_item WHERE listId='$LID4' AND kind='movie' AND tmdbId=550")
[[ "$ROWS" == "1" ]] || fail "two concurrent addToList calls left $ROWS rows, expected 1"
rm -f "$JAR4"
echo "ok  concurrent double submits leave exactly one row"

# --- an unknown title renders the app's own 404 --------------------------
# Without app/not-found.tsx the framework's bare error page was all a visitor
# saw, and /movie/0 is exactly the kind of URL a hand-edited link produces.
CODE=$(curl -s -m 15 "$BASE/movie/0" -o /tmp/nf.html -w '%{http_code}')
[[ "$CODE" == "404" ]] || fail "/movie/0 returned $CODE, expected 404"
body /tmp/nf.html | grep -q "Not found." || fail "/movie/0 does not render the app's not-found page"
echo "ok  an unknown title renders the app-owned not-found page"

unset ACTJAR
rm -f "$JAR2"

echo "ALL CHECKS PASSED"
