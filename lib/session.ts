import { headers } from "next/headers";
import { cache } from "react";
import { getAuth } from "./auth";

export interface SessionUser {
 id: string;
 email: string;
 name: string;
}

/**
 * The authenticated user for the current request, or `null` when
 * unauthenticated. Never throws — callers decide what to do with the
 * null (server actions redirect; queries take `userId` explicitly).
 *
 * Wrapped in React `cache()` so it resolves once per request. A page that
 * reads the session and also renders `SiteHeader` would otherwise hit the
 * session store twice for the same render — measurable on the home page,
 * which now needs the user both for its personal section and for the header.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
 const result = await getAuth().api.getSession({ headers: await headers() });
 if (!result) return null;
 const { user } = result;
 return { id: user.id, email: user.email, name: user.name ?? "" };
});
