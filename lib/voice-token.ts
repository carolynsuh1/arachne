import { createHmac } from "crypto";

type VoiceClaims = {
  sub: string;
  exp: number;
  person_ids: string[];
  goal_id: string;
};

/** Signs a 90-second token. The shared INTERNAL_API_KEY never reaches the browser. */
export function mintVoiceToken(claims: Omit<VoiceClaims, "exp">) {
  const secret = process.env.INTERNAL_API_KEY?.trim();
  if (!secret) throw new Error("Voice is not configured. Set INTERNAL_API_KEY in both apps.");
  const payload: VoiceClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + 90 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function voiceWebSocketUrl() {
  const base = (process.env.VOICE_API_URL || process.env.TEAM_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  return base.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}
