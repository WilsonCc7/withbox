# Withbox

Letterboxd-style tracking for **movies and TV series**. Log what you watched, rate it,
review it, keep a watchlist, follow other users, and play titles in-app.

Deployed to Cloudflare Workers on your own domain.

- **Library tracking** — watched / watchlist / liked toggles that update optimistically and
  still work with JavaScript disabled; four favourites per profile.
- **Diary** — every watch is its own row: date, rewatch flag, episode, review excerpt, and
  a delete that un-watches one watch without forgetting the title. Filter by year or month.
- **Profiles** — avatar (R2), bio, stats, favourites, liked titles, recent diary, reviews.
- **Rating badges** — IMDb and Rotten Tomatoes chips on detail pages and the two library
  pages (first 24 cards); real scores come from OMDb, cached in two layers so the steady
  state is one KV read, and a title without a real score shows the TMDB chip instead.
  Browse grids never call OMDb.
- **Continue watching** — a rail on the home page for anything part-watched, with a
  progress bar and a `Resume S1E3 · 18%` caption. A finished title drops out of it, using
  the same 30-second floor and near-end rule the player applies.
- **Stats** — `/stats`: counts, a per-year bar row, longest streak, top rated and genres,
  every figure derived from rows at query time. `?year=2020` is the year in review.
- **Import** — `/settings/import` takes Letterboxd's `watched.csv` / `watchlist.csv` /
  `ratings.csv` or IMDb's ratings CSV. `watched.csv` and `watchlist.csv` are the same
  columns, so the filename decides which one it is. Matching is exact on title and year (a
  wrong import is worse than a missed one), a re-run adds nothing, and unmatched rows are
  reported.
- **Command palette** — `⌘K` / `Ctrl-K`, or `/` when focus is not in a field: jump to any
  page or to a title, with the same search endpoint the header box uses.
- **Account menu** — the header avatar opens Profile, Diary, Watchlist, Lists, Stats,
  Settings and Sign out.
- **Discovery** — trending films and series, debounced instant search, cast, a 4/6/8 cast
  grid, more-like-this rows, kind filters and a rating sort, list rename/reordering, and a
  paginated activity feed.
- **Player** — pluggable stream-source adapters, resume positions, auto-advance, and a
  remembered source across visits.
- **Mobile** — bottom tab bar, 2-up poster grids, touch-visible quick actions.

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

```
app/ (routes, RSC)   pages; never call TMDB directly
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

## Requirements

- Node 20+ and `pnpm` (`packageManager` pins `pnpm@12.8.1`)
- A Cloudflare account (only for deployment)
- A TMDB API read token (only for live metadata; see *Fixture mode*)
- Optional: an OMDb key for real IMDb / Rotten Tomatoes chips. Without it the badges show
  the TMDB score, and nothing else changes.

## Getting started

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

> `.dev.vars` is git-ignored. Keep permissions tight (`chmod 600 .dev.vars`). Both tokens
> are server-side secrets and must never reach client code or the repository. Without
> `OMDB_API_KEY` the app runs exactly the same, only the badges fall back to the TMDB
> score instead of IMDb / Rotten Tomatoes — which is what fixture mode renders anyway.

Build and start the app:

```sh
pnpm run build
pnpm exec vite preview --port 8787
```

Apply the database migrations **while that server is running**:

```sh
bash scripts/init-local-db.sh
```

Open <http://localhost:8787>, create an account at `/sign-up`, and the whole app is live.

### Why `--port 8787`

`pnpm run start` is `vite preview`, which defaults to **4173**. `BETTER_AUTH_URL`
defaults to `http://localhost:8787`, and Better Auth rejects any request whose `Origin`
header does not match it. Pass `--port 8787` (or set `BETTER_AUTH_URL` to match the port
you chose), and use `localhost` — `127.0.0.1` is rejected as a different origin.

### Environment variables are bindings

A Worker only sees variables declared in `cloudflare.config.ts`. Neither the host shell
environment nor `.dev.vars` reaches the runtime without a declaration there —
`export FOO=bar` before `pnpm run build` is silently invisible. `.dev.vars` only supplies
the *value* of an already-declared secret.

`TMDB_MODE` is baked at build time from `WITHBOX_TMDB_MODE`, and `BETTER_AUTH_URL` from
`WITHBOX_BASE_URL`. Both are plain text bindings read from the shell when the build runs:

```sh
WITHBOX_TMDB_MODE=fixture pnpm run build   # deterministic, network-free artifact
WITHBOX_BASE_URL=https://withbox.example pnpm run build
```

### Fixture mode

`WITHBOX_TMDB_MODE=fixture` builds an artifact that serves a bundled catalogue (12 films,
8 series) with **no network calls at all**. It is how the offline test loop stays
deterministic. Leave it unset (or `auto`) for real TMDB data.

## Development

```sh
pnpm run dev        # vite dev server with HMR
pnpm run build      # production Worker output into .cloudflare/output/
pnpm exec cf workers types   # regenerate binding types after a binding change
pnpm exec tsc --noEmit
```

Run `pnpm exec cf workers types` after **any** binding change, then typecheck — standalone
type-checks do not regenerate binding types on their own.

### Testing

```sh
bash scripts/check-loop.sh   # builds fixture mode, serves :8787, resets local D1, asserts
```

For a manual session against live TMDB, build and serve it yourself, then migrate:

```sh
pnpm run build
pnpm exec vite preview --port 8787 &
bash scripts/init-local-db.sh
```

`scripts/check-loop.sh` is the real test. It bakes fixture mode into the build (so it never
touches the network, whatever `.dev.vars` holds), serves the Worker on port 8787, starts
from a freshly reset local D1, and mocks nothing: it walks the entire app through genuine
server-action `POST`s — the way a no-JS browser would — and asserts each state change.
The assertions cover sign-up through browse, search, watchlist, watched, rating,
review, per-episode progress, resume, follow, feed and lists, then the areas added later:

| Area | Assertions |
|---|---|
| Diary | `logWatch` writes a dated row, a second log flags a rewatch, `deleteWatchEntry` removes exactly one row |
| Likes / favourites | `toggleLiked` shows on the profile; `setFavorite` pins a slot and clears on a second call |
| Lists | `renameList` updates name + description; `moveListItem` reorders in one swap |
| Avatars | Upload round-trips through R2 and `/api/avatar/{id}` (skipped when no bucket) |
| Browsing | `?kind=` filters and the rating sort narrow the grids |
| Feed API | `/api/feed` pages exactly like the server feed and 401s signed-out callers |

`tsc` and a green build prove far less. It resets the local database first, so it is safe
to re-run; it needs port 8787 free and kills its own server via `trap`.

Supporting scripts:

| Script | Purpose |
|---|---|
| `scripts/reset-local-db.sh` | Drop and re-migrate the local D1 database (loopback only) |
| `scripts/init-local-db.sh` | Apply migrations to an existing local database (idempotent) |
| `scripts/find-action.py` | Locate a server action's hidden form field in a rendered page |
| `scripts/page-body.py` | Strip the RSC payload before text assertions |

Local D1 accumulates rows across runs and does not persist across server restarts. Take
ids from the sign-up response, never from a listing page's first link.

## Deploying

Deployed as Worker `withbox` on **https://withbox.wilsb.me**, and only there. That hostname
is the author's own deployment; every `withbox.wilsb.me` below is an example — substitute
your own host in `WITHBOX_BASE_URL` and the route. The hostname is a Workers route declared
in `cloudflare.config.ts` (`triggers.fetch`) behind a proxied CNAME to the workers.dev
subdomain; `workersDev: false` keeps the workers.dev hostname from becoming a second origin,
which Better Auth rejects (`BETTER_AUTH_URL` must equal the origin the browser actually uses).

**1. Create the database and the cache.** D1 database `withbox`, bound by ID:

```sh
pnpm exec cf d1 create --name withbox
```

```ts
DB: bindings.d1({ name: "withbox", id: "your-database-uuid" }),
```

Then the KV namespace the TMDB and OMDb caches live in. `cloudflare.config.ts` ships the
author's namespace id, and a namespace id resolves only inside the account that owns it, so
replace it with one of your own before deploying:

```sh
pnpm exec cf kv namespaces create --title withbox-cache
```

```ts
VINEXT_KV_CACHE: bindings.kv({ id: "your-kv-namespace-id" }),
```

Local dev and `vite preview` emulate KV, so the author's id works there — only a real
deployment needs your own. R2 is the same shape and gets its own step below.

**2. Supply the secrets on the *first* deploy.** `TMDB_API_KEY`, `BETTER_AUTH_SECRET` and
`OMDB_API_KEY` are `bindings.secret()` and are not read from `.dev.vars` in production. A
Worker that does not exist yet has nowhere to hold secrets, so `cf deploy` refuses the
deployment outright (`The following required secrets have not been set`). Carry them with
the first upload instead — `.env` format, one `NAME=value` per line:

```sh
pnpm exec cf deploy --prebuilt --secrets-file ./secrets.env
rm ./secrets.env          # delete immediately; never commit it
```

Later rotations are non-interactive:

```sh
pnpm exec cf workers secrets update OMDB_API_KEY --worker withbox --text '<key>' --type secret_text
```

`OMDB_API_KEY` is optional at runtime — without it every poster and detail page falls back
to the TMDB score chip instead of IMDb / Rotten Tomatoes, which is exactly what fixture mode
renders.

**3. Avatars.** R2 must be enabled on the account first, then:

```sh
pnpm exec cf r2 buckets create --name withbox-avatars
```

The `AVATARS` binding is optional too: with no bucket, uploads return silently and profiles
fall back to name initials.

**4. Build for the host and deploy.** `BETTER_AUTH_URL` is baked into the artifact at build
time, so build and deploy in one breath — `pnpm run deploy` also applies the fetch trigger
declared in `cloudflare.config.ts`:

```sh
env -u WITHBOX_TMDB_MODE WITHBOX_BASE_URL=https://withbox.wilsb.me pnpm run deploy
```

Then apply the migrations to the remote database. The positional is the **database ID**
(UUID), not the binding name — get it from `pnpm exec cf d1 list`. `--dir drizzle` is also
required: the command defaults to `./migrations`, and Drizzle wrote flat `.sql` files into
`drizzle/`:

```sh
pnpm exec cf d1 list                                        # find the database UUID
pnpm exec cf d1 migrations apply <database-uuid> --dir drizzle
```

Remote is the default target; add `--local` to apply against local simulation instead.

### Deployment notes

- **`compatibilityDate` is pinned.** `workerd` is pinned at `1.20261006.1`, whose newest
  supported compatibility date is `2026-10-07`. Setting `compatibilityDate` past it makes
  the runtime refuse to boot with a bare `ERR_RUNTIME_FAILURE`. Raise both together, never
  the date alone.
- **Verify on the built Worker**, not just the dev server — edge runtime differences are
  real. `pnpm run build && pnpm exec vite preview --port 8787`.
- **Prerendering is off.** Every page renders a session-aware header, so no route is static,
  and the prerender pass runs without the Worker's secret bindings. This is deliberate.

## Known limitations

Each of these was reproduced, not guessed.

**Auth does not work under `vite dev`.** Every `/api/auth/*` request 500s with
`sessionSchema.loose is not a function`, thrown at import time from
`better-auth/dist/cookies/cache.mjs` when Vite's SSR pipeline resolves `@better-auth/core/db`.
The production build is unaffected — verify auth with `pnpm run build` and `vite preview`.
Do **not** try to fix this with `ssr.noExternal` or `resolve.dedupe`: bundling `better-auth`
for SSR breaks the D1 dialect detection and takes the production build down with it.

**Auth requests need a matching `Origin`.** Better Auth returns `INVALID_ORIGIN`
otherwise, and `BETTER_AUTH_URL` must match that origin.

**Prerendering cannot be enabled for a subset of routes.** `vite.config.ts` omits the
`prerender` option deliberately; `routes` accepts only `"*"`, all or nothing.

**Local D1 does not persist across server restarts.**

**D1 statement limits force chunking.** Local D1 (miniflare) rejects a compound SELECT with
more than 5 terms, and D1 caps a statement at 100 bound parameters. Every lookup that takes
a list of titles goes through `chunkRefs`/`refFilter` with `REF_CHUNK = 60`
(`lib/library/queries.ts`). `db.transaction` is unusable for the same class of reason: it
emits `begin`/`commit`, which D1 rejects, so atomic multi-writes use `db.batch`.

**Tailwind v4 disables `hover:` on touch devices.** `hover:` and `group-hover:` compile
behind `@media (hover: hover)`, so a hover-only reveal is invisible on a phone. Anything
that must be reachable without a pointer carries `pointer-coarse:opacity-100` — the card
quick actions do — and hit targets are widened with `.touch-hit` / `.touch-hit-y`
(`app/globals.css`).

## Architecture notes

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

`progress: true` means the embed posts playback position back and the app can resume and
auto-advance. Adapters are tried in configured order; the first non-null resolution wins,
and a failing adapter must not throw past its own boundary. The viewer can override the
choice with `?source=`.

**Series progress is derived, never stored.** One row per watched episode; season and show
progress are computed at query time. A stored counter is a bug waiting for a delete. Bulk
actions (*mark season*, *mark show*) are a single `db.batch`.

**Rating chips are cached in two layers.** TMDB's `external_ids` gives a title's IMDb id
(KV `omdb:ids:{kind}:{tmdbId}`, 30 days); OMDb gives the scores (KV `omdb:scores:{imdbId}`,
7 days, and a `Response: "False"` miss retries after an hour). Both upstreams are rate
limited per isolate (20/s) and every failure — no key, no id, timeout, junk payload —
resolves to `{ imdb: null, rt: null }`, which renders the TMDB score chip instead. So the
badges degrade instead of breaking, and steady-state OMDb traffic is near zero. Signed-out
grids skip the whole batch (`user ? … : new Map()` in `app/page.tsx`) to bound fan-out;
detail pages always show real ratings.

**The library is rows, not counters.** A `watch_entry` row is one watch — its own date,
rewatch flag and optional episode — so the diary is a view over the same table the watched
grid reads. Ratings and reviews are title-level (one per user + title); a diary entry never
carries its own score. Likes live in `media_like` (`like` is a SQL keyword); favourites are
four `favorite` rows, one slot each, reassigned deterministically in one `db.batch`. Every
user-owned row carries `user_id`, avatars included (`avatars/{userId}` in R2, served by
`/api/avatar/{userId}` with a `?v=` cache-buster).

**Controls work with JavaScript disabled.** Toggles are client components that submit
through their own `<form action={action} method="post">`, so the plain-HTML POST path stays
intact and the button updates optimistically when JS is present — see
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

**Read bindings from `cloudflare:workers`, not `process.env`.** In the route-handler bundle
`process.env` carries declared bindings, but in the React Server Component render path it
does **not** — a server component reading `process.env.DB` gets `undefined`, and the failure
surfaces far from the cause as a `TypeError: Cannot read properties of undefined
(reading 'prepare')` inside the SQL client. Both paths work through `cloudflare:workers`.

## Scope and legal

Deliberately **out of scope**: hosting, proxying or re-encoding video bytes; internationalisation;
anime-specific handling and ID spaces; native mobile or PWA push notifications; comments,
direct messages and chat; external subtitle tracks.

Liking a *title* and favouriting it are implemented (that is library data, per user).
What stays out is anything social between users: comments, replies, direct messages, chat,
and likes on other people's activity.

The app stores no media and proxies no video bytes — it points at streams. The default
stream sources are unlicensed aggregators, and a takedown response path is required before
the domain is public.
