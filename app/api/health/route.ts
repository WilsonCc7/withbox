export function GET() {
  return Response.json({
    ok: true,
    service: "withbox",
    media: {
      // Reports configuration presence only — never the key itself.
      mode: process.env.TMDB_MODE ?? "auto",
      keyConfigured: Boolean(process.env.TMDB_API_KEY),
    },
  });
}
