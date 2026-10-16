"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

function safeNext(raw: string | null): string {
  return raw !== null && raw.startsWith("/") && !raw.startsWith("//")
    ? raw
    : "/";
}

export default function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const { error: err } = await authClient.signIn.email({
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    });

    if (err) {
      setError(err.message ?? "Could not sign in.");
      setPending(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Email</span>
          <input
            autoComplete="email"
            className="rounded border border-border-strong bg-surface px-3 py-2 text-fg"
            name="email"
            required
            type="email"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Password</span>
          <input
            autoComplete="current-password"
            className="rounded border border-border-strong bg-surface px-3 py-2 text-fg"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <button
          className="rounded bg-accent px-4 py-2 font-medium text-bg disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-sm text-muted">
        No account?{" "}
        <a
          className="text-accent hover:text-accent-hi"
          href={`/sign-up?next=${encodeURIComponent(next)}`}
        >
          Create one
        </a>
      </p>
    </main>
  );
}
