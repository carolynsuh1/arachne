import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertSameOrigin, jsonError, requireApiUser, zodFields } from "@/lib/http";
import { personSchema } from "@/lib/validation";

/* ---------------------------------------------------------------------------
 * STUB: BACKEND WEB-SCRAPER HOOK  (NOT IMPLEMENTED)
 *
 * After a person row is saved, the backend web-scraper should be called here to
 * enrich it (public profile, role, shared history, ...). The scraper is built
 * separately; this route intentionally does nothing with it yet.
 *
 * Suggested contract: send { personId, name, university } to the scraper service
 * and store whatever it returns on the Person row (add columns as needed).
 * Do it fire-and-forget or via a queue so POST /api/people stays fast.
 * ------------------------------------------------------------------------- */
async function callWebScraperStub(_person: { id: string; name: string; university: string }): Promise<void> {
  // TODO(scraper): invoke the backend web-scraper for `_person` here.
}

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  const people = await prisma.person.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ people });
}

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  const { user, response } = await requireApiUser();
  if (!user) return response;

  const parsed = personSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Please fix the highlighted fields.", 400, zodFields(parsed.error));

  const person = await prisma.person.create({ data: { ...parsed.data, userId: user.id } });

  await callWebScraperStub(person); // <-- scraper hook (see STUB above)

  return NextResponse.json({ person }, { status: 201 });
}
