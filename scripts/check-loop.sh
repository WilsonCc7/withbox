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
# it. Assert on the profile LINK instead: /people must not point at the viewer.
grep -q "/u/$UID2" /tmp/people.html && fail "/people links to the viewer's own profile"
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
rm -f "$JAR3"

unset ACTJAR
rm -f "$JAR2"

echo "ALL CHECKS PASSED"
