import { headers } from "next/headers";
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
 */
export async function currentUser(): Promise<SessionUser | null> {
  const result = await getAuth().api.getSession({ headers: await headers() });
  if (!result) return null;
  const { user } = result;
  return { id: user.id, email: user.email, name: user.name ?? "" };
}
