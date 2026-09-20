import { assertSameOrigin, jsonError, requireApiUser } from "@/lib/http";
import { linkedinUrlSchema } from "@/lib/validation";
import { tooManyAttempts } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const blocked = assertSameOrigin(req); if (blocked) return blocked;
  const { user, response } = await requireApiUser(); if (!user) return response;
  const body = await req.json().catch(() => null);
  const parsed = linkedinUrlSchema.safeParse(body?.linkedinUrl);
  if (!parsed.success || !parsed.data) return jsonError("Enter your LinkedIn /in/ profile URL.", 400);
  if (tooManyAttempts(`self-linkedin:${user.id}`, 8, 3600000)) return jsonError("Too many imports. Please try again later.", 429);
  try {
    const base = (process.env.RESEARCH_SERVICE_URL || "http://127.0.0.1:8791").replace(/\/$/, "");
    const res = await fetch(`${base}/api/self-profile`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileUrl: parsed.data }), signal: AbortSignal.timeout(100000),
    });
    if (!res.ok) return jsonError(res.status === 429 ? "Research is busy. Please retry shortly." : "LinkedIn import could not finish.", res.status === 429 ? 429 : 502);
    const { profile } = await res.json();
    const clean = (v: unknown) => typeof v === "string" ? v : "";
    const rows = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(x => x && typeof x === "object").slice(0, 40) : [];
    const education = rows(profile?.education);
    return Response.json({ fields: {
      fullName: clean(profile?.name).slice(0,100),
      university: clean(education[0]?.school).slice(0,120),
      workExperience: rows(profile?.experience).map(x => [clean(x.position),clean(x.company),[clean(x.starts_at),clean(x.ends_at)].filter(Boolean).join(" – "),clean(x.summary)].filter(Boolean).join(" | ")).join("\n\n").slice(0,4000),
      education: education.map(x => [clean(x.school),clean(x.degree),clean(x.field_of_study),[clean(x.starts_at),clean(x.ends_at)].filter(Boolean).join(" – ")].filter(Boolean).join(" | ")).join("\n\n").slice(0,4000),
    }});
  } catch { return jsonError("LinkedIn import timed out or is unavailable.", 502); }
}
