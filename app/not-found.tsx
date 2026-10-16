import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-semibold">Not found.</h1>
        <p className="mt-3 text-muted">
          That page doesn&apos;t exist. It may have been removed, or the link may be
          wrong.
        </p>
        <a className="mt-6 inline-block text-sm text-accent hover:text-accent-hi" href="/">
          Back home
        </a>
      </main>
    </>
  );
}
