import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req);
  if (blocked) return blocked;
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ redirect: "/login" });
}
