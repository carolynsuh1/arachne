import { NextResponse } from "next/server";
import { getGoalView } from "@/lib/goal-view";
import { requireApiUser } from "@/lib/http";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  return NextResponse.json(await getGoalView(user.id));
}
