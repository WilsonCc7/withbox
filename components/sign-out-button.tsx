"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      className={className ?? "whitespace-nowrap text-sm text-muted hover:text-fg"}
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
      type="button"
    >
      Sign out
    </button>
  );
}
