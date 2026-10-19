import { bindings, defineConfig, defineWorker, triggers } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "withbox",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-07",
    compatibilityFlags: ["nodejs_compat"],
    // One canonical origin. `BETTER_AUTH_URL` is baked at build time and must
    // equal the origin the browser uses, so a second hostname (the workers.dev
    // route) is a second origin that Better Auth would reject.
    workersDev: false,
    triggers: [
      triggers.fetch({ pattern: "withbox.wilsb.me/*", zone: "wilsb.me" }),
    ],
    assets: { notFoundHandling: "none", runWorkerFirst: ["/_vinext/static-cache/*"] },
    env: {
      ASSETS: bindings.assets(),
      // Local dev and preview emulate KV, so this id works there; a deployment
      // under another account must swap in its own namespace id (see README).
      VINEXT_KV_CACHE: bindings.kv({
        id: "0a4596c051b347c1b83569c74ff25372",
      }),
      // Workers only expose declared bindings on `process.env`; neither the host
      // shell environment nor `.dev.vars` reaches the Worker without this.
      // The mode is baked at build time so the benchmark can force fixtures.
      TMDB_MODE: bindings.text(process.env.WITHBOX_TMDB_MODE ?? "auto"),
      TMDB_API_KEY: bindings.secret(),
      // IMDb / Rotten Tomatoes scores. Server-side only; absent degrades to the
      // TMDB score chip.
      OMDB_API_KEY: bindings.secret(),
      // User avatars. Local dev/preview emulates the bucket.
      AVATARS: bindings.r2({ name: "withbox-avatars" }),
      // The `withbox` database lives in the owner's account; the UUID is not a secret.
      DB: bindings.d1({
        name: "withbox",
        id: "e5090792-bfad-48ef-9a12-b82094d547e8",
      }),
      BETTER_AUTH_SECRET: bindings.secret(),
      // Must be set for a real deployment; localhost is the dev default only.
      BETTER_AUTH_URL: bindings.text(
        process.env.WITHBOX_BASE_URL ?? "http://localhost:8787",
      ),
    },
  }),
});
