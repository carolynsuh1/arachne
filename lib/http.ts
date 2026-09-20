import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export function jsonError(message: string, status: number, fields?: Record<string, string>) {
  return NextResponse.json({ error: message, fields }, { status });
}

/** CSRF defence in depth (cookies are also SameSite=Lax): reject cross-origin state-changing requests. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("host");
  try {
    if (new URL(origin).host !== host) return jsonError("Cross-origin request blocked.", 403);
  } catch {
    return jsonError("Bad origin.", 403);
  }
  return null;
}

/** For API routes: returns the user or a 401 response. */
export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: jsonError("Please log in.", 401) } as const;
  return { user, response: null } as const;
}

export function zodFields(error: import("zod").ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
