import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { staticAssetsAdapter } from "@vinext/cloudflare/cache/static-assets-adapter";

export default defineConfig({
  plugins: [
    vinext({
      cache: { data: kvDataAdapter(), cdn: staticAssetsAdapter() },
      // Prerendering is off: every page renders a session-aware header, so no
      // route is truly static, and the prerender pass runs without the Worker's
      // secret bindings. Turn it back on only for genuinely public routes.
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
