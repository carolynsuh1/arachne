import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/http";
import { teamHealthy } from "@/lib/team-api";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  return NextResponse.json({ backend: (await teamHealthy()) ? "online" : "offline" });
}
