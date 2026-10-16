# Withbox

Letterboxd-style tracking for **movies and TV series**. Log what you watched, rate it,
review it, keep a watchlist, follow other users, and play titles in-app.

Deployed to Cloudflare Workers on your own domain.

| Layer | Choice |
|---|---|
| Build | **vinext** (Next.js App Router on Vite), TypeScript |
| Runtime | Cloudflare Workers |
| UI | Tailwind CSS v4 |
| Database | D1 (SQLite) via Drizzle ORM |
| Auth | Better Auth — email + password, multi-user |
| Metadata | TMDB (movies + TV, per-episode data) — server-side only |
| Player | Pluggable stream-source adapters, iframe embeds |

```
app/ (routes, RSC)   pages; never call TMDB directly
  lib/tmdb/          TMDB client: caching, rate limiting, ID mapping
  lib/sources/       stream source adapters (the seam)
  db/                Drizzle schema + migrations (D1)
  components/        UI: player shell, poster grids
```

## Requirements

- Node 20+ and `pnpm` (`packageManager` pins `pnpm@12.8.1`)
- A Cloudflare account (only for deployment)
- A TMDB API read token (only for live metadata; see *Fixture mode*)

## Getting started

```sh
pnpm install
```

Create `.dev.vars` in the repository root:

```ini
TMDB_API_KEY=your-tmdb-read-token
TMDB_MODE=auto
BETTER_AUTH_SECRET=any-long-random-string
```

> `.dev.vars` is git-ignored. Keep permissions tight (`chmod 600 .dev.vars`). The TMDB
> token is a server-side secret and must never reach client code or the repository.

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
pnpm run build
pnpm exec vite preview --port 8787 &
bash scripts/reset-local-db.sh    # drop + re-migrate local D1
bash scripts/check-loop.sh        # resets local D1, then drives the whole app
```

`scripts/check-loop.sh` is the real test. It builds nothing and mocks nothing: it walks the
entire tracking loop through genuine server-action `POST`s — the way a no-JS browser would —
and asserts each state change, from sign-up through browse, search, watchlist, watched,
rating, review, per-episode progress, resume, follow, feed and lists. `tsc` and a green
build prove far less. It resets the local database first, so it is safe to re-run.

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
is a Workers route declared in `cloudflare.config.ts` (`triggers.fetch`) behind a proxied
CNAME to the workers.dev subdomain; `workersDev: false` keeps the workers.dev hostname from
becoming a second origin, which Better Auth rejects (`BETTER_AUTH_URL` must equal the origin
the browser actually uses).

**1. Create the database.** D1 database `withbox`, bound by ID:

```sh
pnpm exec cf d1 create withbox
```

```ts
DB: bindings.d1({ name: "withbox", id: "your-database-uuid" }),
```

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
pnpm exec cf r2 buckets create withbox-avatars
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
actions (*mark season*, *mark show*) are a single batched transaction.

**Read bindings from `cloudflare:workers`, not `process.env`.** In the route-handler bundle
`process.env` carries declared bindings, but in the React Server Component render path it
does **not** — a server component reading `process.env.DB` gets `undefined`, and the failure
surfaces far from the cause as a `TypeError: Cannot read properties of undefined
(reading 'prepare')` inside the SQL client. Both paths work through `cloudflare:workers`.

## Scope and legal

Deliberately **out of scope**: hosting, proxying or re-encoding video bytes; internationalisation;
anime-specific handling and ID spaces; native mobile or PWA push notifications; comments,
direct messages, likes or chat; external subtitle tracks.

The app stores no media and proxies no video bytes — it points at streams. The default
stream sources are unlicensed aggregators, and a takedown response path is required before
the domain is public.
