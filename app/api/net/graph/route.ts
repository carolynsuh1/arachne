import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/http";
import { getUserNetwork } from "@/lib/network";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  return NextResponse.json(await getUserNetwork(user.id));
}
