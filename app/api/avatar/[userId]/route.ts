import { env } from "@/lib/env";

/**
 * Serves avatar objects from the AVATARS R2 bucket.
 *
 * Public: profile pages are public, so avatars are too. The bucket
 * name and any credentials never reach the client, and the object
 * key is derived from the userId path segment alone — a client can
 * only ever fetch its own `avatars/<userId>` object.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const bucket = env().AVATARS;
  if (!bucket) return new Response(null, { status: 404 });

  const { userId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) {
    return new Response(null, { status: 404 });
  }

  const object = await bucket.get(`avatars/${userId}`);
  if (!object) return new Response(null, { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=3600",
      etag: object.httpEtag,
    },
  });
}
