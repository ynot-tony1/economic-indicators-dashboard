import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";

// Called by the nightly pipeline right after it loads fresh data. Without it,
// ISR pages only regenerate when someone visits after the hourly window, and
// that first visitor still gets the stale copy - so a quiet site could show
// "Updated" days behind the data it actually has.
function authorized(request: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ revalidated: false }, { status: 401 });
  }
  // Every page sits under the root layout, so this marks all of them stale;
  // each one re-renders from the database on its next visit.
  revalidatePath("/", "layout");
  return Response.json({ revalidated: true, at: new Date().toISOString() });
}
