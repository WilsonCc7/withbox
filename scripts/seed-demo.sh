#!/usr/bin/env bash
# Seeds a demo account on the live preview server so the design critique has
# real content to look at. Uses the no-JS form path, like check-loop.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${1:-http://localhost:8788}"
JAR=/tmp/demo.jar
EMAIL="demo@withbox.test"
PASS="demo-password-1234"
rm -f "$JAR"

curl -s -m 20 -X POST "$BASE/api/auth/sign-up/email" -H "Content-Type: application/json" \
  -H "Origin: $BASE" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Alex Rivera\"}" \
  -c "$JAR" -o /tmp/demo-signup.json
USER_ID=$(python3 -c "import json;print(json.load(open('/tmp/demo-signup.json'))['user']['id'])")
echo "user=$USER_ID"

action_for() { python3 scripts/find-action.py "$1" "$2"; }

post() { # url action kv...
  local url="$1" action="$2"; shift 2
  local args=(-F "$action=")
  for kv in "$@"; do args+=(-F "$kv"); done
  curl -s -m 25 -X POST "$url" -b "$JAR" -c "$JAR" -H "Origin: $BASE" "${args[@]}" -o /dev/null -w '%{http_code}'
}

# Films: watched, rated, some logged to the diary, a couple liked.
seed_movie() { # id rating diary_date like
  local id="$1" rating="$2" date="$3" like="$4"
  local f="/tmp/demo-$id.html"
  curl -s -m 25 "$BASE/movie/$id" -b "$JAR" -o "$f"
  post "$BASE/movie/$id" "$(action_for "$f" toggleWatched)" kind=movie tmdbId="$id" >/dev/null
  [[ -n "$rating" ]] && post "$BASE/movie/$id" "$(action_for "$f" setRating)" kind=movie tmdbId="$id" value="$rating" >/dev/null
  [[ -n "$date" ]] && post "$BASE/movie/$id" "$(action_for "$f" logWatch)" kind=movie tmdbId="$id" watchedAt="$date" >/dev/null
  [[ "$like" == "1" ]] && post "$BASE/movie/$id" "$(action_for "$f" toggleLiked)" kind=movie tmdbId="$id" >/dev/null
  echo "  movie $id rating=${rating:-none} date=${date:-none} like=$like"
}

seed_movie 550 9 2020-05-04 1
seed_movie 27205 10 2021-07-16 1
seed_movie 238 9 2022-01-09 0
seed_movie 155 8 2023-03-21 0
seed_movie 680 7 2024-11-02 0
seed_movie 13 8 2025-02-14 1
seed_movie 496243 9 2026-01-30 0

# A review with body copy, so the profile and detail page have prose to set.
F=/tmp/demo-review.html
curl -s -m 25 "$BASE/movie/550" -b "$JAR" -o "$F"
post "$BASE/movie/550" "$(action_for "$F" setReview)" kind=movie tmdbId=550 \
  body="Still the best opening twenty minutes in the catalogue." >/dev/null

# Favourites across two slots.
for pair in "27205 0" "496243 1"; do
  set -- $pair
  post "$BASE/movie/$1" "$(action_for "$F" setFavorite)" kind=movie tmdbId="$1" slot="$2" >/dev/null
done
echo "  favourites pinned"

# Watchlist: three titles, not watched.
for id in 693134 157336 872585; do
  W=/tmp/demo-wl-$id.html
  curl -s -m 25 "$BASE/movie/$id" -b "$JAR" -o "$W"
  post "$BASE/movie/$id" "$(action_for "$W" toggleWatchlist)" kind=movie tmdbId="$id" >/dev/null
  echo "  watchlist $id"
done

# TV: one show watched across a season, one series half-watched.
mark_season() { # show season episodes...
  local show="$1" season="$2"; shift 2
  local s="/tmp/demo-s-$show-$season.html"
  curl -s -m 25 "$BASE/tv/$show/season/$season" -b "$JAR" -o "$s"
  local eps
  eps=$(IFS=,; echo "$*")
  post "$BASE/tv/$show/season/$season" "$(action_for "$s" markSeason)" \
    tmdbId="$show" season="$season" episodes="$eps" >/dev/null
  echo "  tv $show season $season episodes=$eps"
}

mark_season 94605 1 1 2 3 4 5 6 7 8 9
mark_season 1396 1 1 2 3 4 5

echo "seeded $USER_ID"
echo "$USER_ID" > /tmp/demo-uid.txt
