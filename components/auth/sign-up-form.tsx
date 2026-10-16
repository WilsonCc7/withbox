"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

function safeNext(raw: string | null): string {
  return raw !== null && raw.startsWith("/") && !raw.startsWith("//")
    ? raw
    : "/";
}

export default function SignUpForm() {
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
    const { error: err } = await authClient.signUp.email({
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      name: String(data.get("name") ?? ""),
    });

    if (err) {
      setError(err.message ?? "Could not create the account.");
      setPending(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold">Create an account</h1>

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Name</span>
          <input
            autoComplete="name"
            className="rounded border border-border-strong bg-surface px-3 py-2 text-fg"
            name="name"
            required
            type="text"
          />
        </label>

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
            autoComplete="new-password"
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
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="text-sm text-muted">
        Already have one?{" "}
        <a
          className="text-accent hover:text-accent-hi"
          href={`/sign-in?next=${encodeURIComponent(next)}`}
        >
          Sign in
        </a>
      </p>
    </main>
  );
}
