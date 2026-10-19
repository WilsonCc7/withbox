# Withbox

**Letterboxd, if Letterboxd also did TV Series and let you hit play.**

Track films *and* series: log every watch, rate it, review it, keep a watchlist, follow
people, and start the episode without leaving the app. Every control also works with
JavaScript switched off — which is a lovelier sentence to write than it is to implement.

You can import your Letterboxd library yourself.

## What's in the box

🎬 **Player** — pluggable stream-source adapters behind one small interface, resume
positions, auto-advance, and a remembered source across visits. The app points at streams;
it never stores or proxies a single video byte.

📓 **Diary** — every watch is its own row: date, rewatch flag, episode, review excerpt. A
delete un-watches one watch without making the app forget you ever saw the title. Filter by
year or month.

👀 **Library** — watched / watchlist / liked toggles that update optimistically and still
submit without JS, plus four favourites per profile.

⭐ **Rating badges** — real IMDb and Rotten Tomatoes chips on detail pages and the first 24
cards of the two library pages. Scores come from OMDb but are cached in two layers, so the
steady state is one KV read and no upstream call; a title with no real score quietly shows
the TMDB chip instead. Browse grids never touch OMDb at all.

▶️ **Continue watching** — a home-page rail of anything part-watched, with a progress bar
and a `Resume S1E3 · 18%` caption. Finished titles drop out on the same 30-second floor and
near-end rule the player itself applies.

📊 **Stats** — `/stats` counts, a per-year bar row, longest streak, top-rated and top
genres. Every figure is a query at render time; none of them is a stored counter.
`?year=2020` is your year in review.

📥 **Import** — `/settings/import` takes Letterboxd's `watched.csv` / `watchlist.csv` /
`ratings.csv` or IMDb's ratings CSV. Matching is exact on title and year, because a wrong
import is worse than a missed one; a re-run adds nothing, and unmatched rows are reported
back to you.

⌨️ **Command palette** — `⌘K` / `Ctrl-K`, or `/` when you're not already in a field. Jumps
to any page or straight to a title.

🍿 **The rest** — trending films and series, debounced instant search, cast, more-like-this
rows, user lists with rename and reordering, a paginated activity feed, profiles with
avatars and reviews, and a bottom tab bar on mobile.

## The stack

| Layer | Choice |
|---|---|
| Build | **vinext** (Next.js App Router on Vite), TypeScript |
| Runtime | Cloudflare Workers |
| UI | Tailwind CSS v4 |
| Database | D1 (SQLite) via Drizzle ORM |
| Cache | Workers KV — TMDB responses, IMDb id / OMDb score maps |
| Auth | Better Auth — email + password, multi-user |
| Metadata | TMDB (movies + TV, per-episode data) — server-side only |
| Ratings | OMDb → IMDb / Rotten Tomatoes chips (optional key) |
| Storage | R2 — avatars, served from `/api/avatar/{userId}` |
| Player | Pluggable stream-source adapters, iframe embeds |

## Where things live

```
app/ (routes, RSC)   pages; they never call TMDB directly
  lib/tmdb/          TMDB client: KV cache, rate limiting, ID mapping
  lib/ratings/       OMDb → IMDb / RT, cached in two layers
  lib/library/       user library: server actions + reads
  lib/social/        follow, feed, lists, activity
  lib/profile/       profile, bio, avatar actions
  lib/stats/         derived library statistics (no counters)
  lib/import/        CSV parse, export detection, import action
  lib/player/        progress parsing, resume rules
  lib/sources/       stream source adapters (the seam)
  db/                Drizzle schema; migrations in drizzle/
  components/        UI: shell + tab bar, poster grids, palette, player shell
  public/fonts/      self-hosted display face (next/font is a vinext gap)
```

## Get it running

You need **Node 20+** and **pnpm** (`packageManager` pins `pnpm@12.8.1`). A TMDB read token
gets you real metadata — without one you can run the bundled fixture catalogue instead, and
that path touches no network at all.

Fork or copy the repo, then:

```sh
pnpm install
```

Create `.dev.vars` in the repository root:

```ini
TMDB_API_KEY=your-tmdb-read-token
TMDB_MODE=auto
BETTER_AUTH_SECRET=any-long-random-string
OMDB_API_KEY=your-omdb-key          # optional: real IMDb / RT chips
```

> `.dev.vars` is git-ignored. Keep it tight (`chmod 600 .dev.vars`) — both tokens are
> server-side secrets and must never reach client code or the repository. Skip
> `OMDB_API_KEY` and nothing breaks: the badges fall back to the TMDB score, which is
> exactly what fixture mode renders anyway.

Build it, serve it, then apply the migrations **while that server is running**:

```sh
pnpm run build
pnpm exec vite preview --port 8787      # in one terminal
bash scripts/init-local-db.sh           # in another
```

Open <http://localhost:8787> and make yourself an account at `/sign-up`. That's the whole
app, live.

### Why exactly `--port 8787`

`pnpm run start` is `vite preview`, which defaults to **4173**. `BETTER_AUTH_URL` defaults
to `http://localhost:8787`, and Better Auth rejects any request whose `Origin` header does
not match it. So pass `--port 8787` (or set `BETTER_AUTH_URL` to match whatever port you
picked), and use `localhost` — `127.0.0.1` is a different origin and gets rejected too.

### Env vars are bindings, not shell env

A Worker only sees variables declared in `cloudflare.config.ts`. Neither your shell
environment nor `.dev.vars` reaches the runtime without a declaration there, so
`export FOO=bar` before `pnpm run build` is silently invisible. `.dev.vars` supplies the
*value* of a secret that is already declared.

Two are baked in at build time from the shell, which is how the test loop stays offline:

```sh
WITHBOX_TMDB_MODE=fixture pnpm run build   # deterministic, network-free artifact
WITHBOX_BASE_URL=https://example.com pnpm run build
```

`TMDB_MODE` comes from `WITHBOX_TMDB_MODE`, and `BETTER_AUTH_URL` from `WITHBOX_BASE_URL`.

### Fixture mode

`WITHBOX_TMDB_MODE=fixture` builds an artifact that serves a bundled catalogue — 12 films,
8 series — with **no network calls at all**. It is how the offline test loop stays
deterministic, and it is the fastest way to see the app if you don't have a TMDB token yet.
Leave it unset (or `auto`) for real data.

## Development

```sh
pnpm run dev        # vite dev server with HMR
pnpm run build      # production Worker output into .cloudflare/output/
pnpm exec cf workers types   # regenerate binding types after a binding change
pnpm exec tsc --noEmit
```

Run `pnpm exec cf workers types` after **any** binding change, then typecheck — a standalone
type-check does not regenerate binding types on its own.

Heads up: auth does not work under `vite dev` (see *Things that will bite you*), so `dev` is
for UI work. To exercise anything that touches a session, use the built Worker.

## Testing

```sh
bash scripts/check-loop.sh   # builds fixture mode, serves :8787, resets local D1, asserts
```

This is the real test, and it mocks nothing. It bakes fixture mode into the build (so it
never touches the network, whatever your `.dev.vars` holds), serves the Worker on port 8787,
starts from a freshly reset local D1, and then walks the entire app through genuine
server-action `POST`s — the way a no-JS browser would — asserting every state change along
the way. Sign-up through browse, search, watchlist, watched, rating, review, per-episode
progress, resume, follow, feed and lists, plus the later additions:

| Area | Assertions |
|---|---|
| Diary | `logWatch` writes a dated row, a second log flags a rewatch, `deleteWatchEntry` removes exactly one row |
| Likes / favourites | `toggleLiked` shows on the profile; `setFavorite` pins a slot and clears on a second call |
| Lists | `renameList` updates name + description; `moveListItem` reorders in one swap |
| Avatars | Upload round-trips through R2 and `/api/avatar/{id}` (skipped when no bucket) |
| Import | watchlist rows land in the watchlist only, and a re-run adds nothing |
| Browsing | `?kind=` filters and the rating sort narrow the grids |
| Feed API | `/api/feed` pages exactly like the server feed and 401s signed-out callers |

`tsc` and a green build prove far less. The loop resets the local database first, so re-runs
are safe; it needs port 8787 free and kills its own server via `trap`.

Four helper scripts do the fiddly bits:

| Script | Purpose |
|---|---|
| `scripts/reset-local-db.sh` | Drop and re-migrate the local D1 database (loopback only) |
| `scripts/init-local-db.sh` | Apply migrations to an existing local database (idempotent) |
| `scripts/find-action.py` | Locate a server action's hidden form field in a rendered page |
| `scripts/page-body.py` | Strip the RSC payload before text assertions |

Local D1 accumulates rows across runs and does not survive a server restart. Take ids from
the sign-up response, never from a listing page's first link.

## Things that will bite you

Each of these was reproduced, not guessed. Read it now, thank yourself later.

**Auth is broken under `vite dev`.** Every `/api/auth/*` request 500s with
`sessionSchema.loose is not a function`, thrown at import time from
`better-auth/dist/cookies/cache.mjs` when Vite's SSR pipeline resolves `@better-auth/core/db`.
The production build is unaffected — verify auth with `pnpm run build` and `vite preview`.
Do **not** go fixing this with `ssr.noExternal` or `resolve.dedupe`: bundling `better-auth`
for SSR breaks the D1 dialect detection and takes the production build down with it.

**Auth requests need a matching `Origin`.** Otherwise Better Auth answers `INVALID_ORIGIN`,
and `BETTER_AUTH_URL` must match the origin the browser actually used.

**Prerendering is off, by choice.** Every page renders a session-aware header, so no route
is static, and the prerender pass runs without the Worker's secret bindings. `routes` in the
config accepts only `"*"`, so it is all or nothing rather than a subset of routes.

**Local D1 forgets everything across server restarts.** Deployed D1 is unaffected.

**D1 caps your statements, so the code chunks.** Local D1 (miniflare) rejects a compound
SELECT with more than 5 terms, and D1 caps a statement at 100 bound parameters. Every lookup
that takes a list of titles goes through `chunkRefs` / `refFilter` with `REF_CHUNK = 60`
(`lib/library/queries.ts`). `db.transaction` is unusable for the same family of reasons — it
emits `begin`/`commit`, which D1 rejects — so atomic multi-writes are `db.batch`.

**Tailwind v4 disables `hover:` on touch devices.** `hover:` and `group-hover:` compile
behind `@media (hover: hover)`, so a hover-only reveal is simply invisible on a phone.
Anything that has to be reachable without a pointer carries `pointer-coarse:opacity-100` —
the card quick actions do — and hit targets are widened with `.touch-hit` / `.touch-hit-y`
in `app/globals.css`.

**Read bindings from `cloudflare:workers`, not `process.env`.** In the route-handler bundle
`process.env` carries declared bindings; in the React Server Component render path it does
**not**. A server component reading `process.env.DB` gets `undefined`, and the failure
surfaces far away as `TypeError: Cannot read properties of undefined (reading 'prepare')`
inside the SQL client. Both paths work through `cloudflare:workers`.

## How it's put together

**The source adapter seam.** Every playable stream resolves through one interface, and
nothing outside `lib/sources/` constructs a third-party player URL:

```ts
type Resolution =
  | { kind: "iframe"; url: string; progress: boolean }
  | { kind: "stream"; url: string; mime: string }

interface SourceAdapter {
  name: string
  resolve(tmdbId: number, season?: number, episode?: number): Promise<Resolution | null>
}
```

`progress: true` means the embed posts playback position back, so the app can resume and
auto-advance. Adapters are tried in configured order and the first non-null resolution wins;
a failing adapter must not throw past its own boundary. `?source=` overrides the remembered
choice.

**Series progress is derived, never stored.** One row per watched episode; season and show
progress are computed at query time. A stored counter is a bug waiting for a delete. Bulk
actions — *mark season*, *mark show* — are a single `db.batch`.

**Rating chips are cached in two layers.** TMDB's `external_ids` gives a title's IMDb id
(KV `omdb:ids:{kind}:{tmdbId}`, 30 days); OMDb gives the scores (KV
`omdb:scores:{imdbId}`, 7 days, and a `Response: "False"` miss retries after an hour). Both
upstreams are rate limited per isolate and every failure — no key, no id, timeout, junk
payload — resolves to `{ imdb: null, rt: null }`, which renders the TMDB chip instead. So the
badges degrade rather than break, and steady-state OMDb traffic is near zero. Signed-out
grids skip the whole batch to bound fan-out; detail pages always show real ratings.

**The library is rows, not counters.** A `watch_entry` row is one watch, with its own date,
rewatch flag and optional episode, so the diary is a view over the same table the watched
grid reads. Ratings and reviews are title-level, one per user and title; a diary entry never
carries its own score. Likes live in `media_like` (`like` is a SQL keyword), and favourites
are four `favorite` rows, one slot each, reassigned deterministically in one `db.batch`.
Every user-owned row carries `user_id`, avatars included — `avatars/{userId}` in R2, served
by `/api/avatar/{userId}` with a `?v=` cache-buster.

**Controls work with JavaScript disabled.** Toggles are client components that submit
through their own `<form action={action} method="post">`, so the plain-HTML POST path stays
intact while the button still updates optimistically when JS is available — see
`components/library/watch-toggle.tsx` for the pattern. Server actions revalidate through
`pathsForMedia(userId, kind, tmdbId)` in `lib/library/actions.ts`, the single place that
names every path a library change affects.

**Pages and endpoints.**

| Path | What it is |
|---|---|
| `/` | Trending films + series; recently watched when signed in |
| `/search` | Full-text search — `/api/search` backs the debounced suggestions |
| `/watched`, `/watchlist` | Kept grids with `?kind=` and, on watched, `?sort=rating` |
| `/diary` | One row per watch, `?year=` / `?month=` filters, log + delete |
| `/feed` | Activity feed; `/api/feed?before=` appends older pages |
| `/lists`, `/lists/[id]` | User lists, rename + per-item reordering for the owner |
| `/movie/[id]`, `/tv/[id]`, `/tv/[id]/season/[n]` | Detail pages, cast/crew, per-episode progress |
| `/watch/[kind]/[id]` | Player shell; `?source=` overrides the remembered source |
| `/u/[id]`, `/u/[id]/reviews` | Profile (avatar, bio, stats, favourites, likes, diary) and all reviews |
| `/people` | Everyone on the instance, with follow buttons |
| `/settings` | Name, bio, avatar upload/removal (self only) |
| `/sign-in`, `/sign-up` | Email + password auth |
| `/api/health`, `/api/avatar/{userId}` | Liveness; avatar bytes out of R2 |

## What's deliberately missing

Deliberately **out of scope**: hosting, proxying or re-encoding video bytes;
internationalisation; anime-specific handling and ID spaces; a native mobile app or PWA push
notifications; comments, direct messages and chat; external subtitle tracks (iframe sources
bring their own).

Liking a *title* and favouriting it are implemented — that's library data, per user. What
stays out is everything social *between* users: comments, replies, direct messages, chat,
and likes on other people's activity.

## The legal bit

The app stores no media and proxies no video bytes; it points at streams. The default stream
sources are unlicensed aggregators, and a takedown response path is required before the
domain is public.
