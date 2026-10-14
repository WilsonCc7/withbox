import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "withbox",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-07",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none", runWorkerFirst: ["/_vinext/static-cache/*"] },
    env: {
      ASSETS: bindings.assets(),
      VINEXT_KV_CACHE: bindings.kv(),
      // Workers only expose declared bindings on `process.env`; neither the host
      // shell environment nor `.dev.vars` reaches the Worker without this.
      // The mode is baked at build time so the benchmark can force fixtures.
      TMDB_MODE: bindings.text(process.env.WITHBOX_TMDB_MODE ?? "auto"),
      TMDB_API_KEY: bindings.secret(),
    },
  }),
});
