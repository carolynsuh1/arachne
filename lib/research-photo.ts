import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Save the verified provider's photo during research, before its signed CDN URL expires. */
export async function saveResearchPhoto(personId: string, value?: string) {
  try {
    const url = new URL(value || "");
    if (url.protocol !== "https:" || !/(^|\.)licdn\.com$/.test(url.hostname) || url.port || url.username || url.password) return;
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok || !response.body) return;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.length;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); return; }
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    const type = data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png"
      : data[0]===255 && data[1]===216 && data[2]===255 ? "image/jpeg"
      : data.toString("ascii",0,4)==="RIFF" && data.toString("ascii",8,12)==="WEBP" ? "image/webp" : null;
    if (!type) return;
    const dir = path.resolve(process.env.UPLOAD_DIR || "uploads", "avatars");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${personId}.research.json`), JSON.stringify({ type, data: data.toString("base64") }));
  } catch { /* Photo failure must not discard successful research. */ }
}
