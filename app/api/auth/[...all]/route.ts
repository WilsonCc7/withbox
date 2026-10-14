import { getAuth } from "../../../../lib/auth";

/**
 * Mounts the Better Auth handler at `/api/auth/*`.
 *
 * Better Auth's handler is web-standard: it takes a `Request`
 * and returns a `Promise<Response>`, so it runs directly in
 * the Workers runtime with no adapter. The catch-all `[...all]`
 * segment carries the sub-path (`/api/auth/sign-in/email`,
 * `/api/auth/session`, ...), which Better Auth reads off the
 * request URL itself.
 */
export async function GET(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export async function POST(request: Request): Promise<Response> {
  return getAuth().handler(request);
}
