import { getActivity } from "@/lib/social/queries";
import { buildFeedRows } from "@/lib/social/feed-rows";
import { parseActivityCursor } from "@/lib/social/types";
import { currentUser } from "@/lib/session";

export async function GET(request: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) {
    return Response.json({ error: "sign in required" }, { status: 401 });
  }
  const raw = new URL(request.url).searchParams.get("before");
  const parsed = parseActivityCursor(raw);
  const before = parsed ? { at: new Date(parsed.at), id: parsed.id } : undefined;

  const page = await getActivity(user.id, { before });
  const rows = await buildFeedRows(page.items);
  // JSON has no Date: the client turns `next` straight back into a query string.
  const next = page.next ? `${page.next.at.getTime()}-${page.next.id}` : null;
  return Response.json(
    { rows, next },
    { headers: { "cache-control": "private, no-store" } },
  );
}
