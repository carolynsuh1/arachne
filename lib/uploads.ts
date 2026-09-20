import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { RESUME_MAX_BYTES } from "@/lib/validation";

// Resumes live on disk outside /public, so they are never served statically.
function uploadRoot() {
  return path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
}

const TYPES = {
  pdf: { mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: [0x50, 0x4b, 0x03, 0x04], // ZIP container
  },
} as const;

export type ResumeCheck = { ok: true; ext: "pdf" | "docx"; bytes: Buffer } | { ok: false; error: string };

/** Checks size, extension, declared MIME type, and the file's magic bytes. */
export async function checkResume(file: File): Promise<ResumeCheck> {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > RESUME_MAX_BYTES) return { ok: false, error: "Resume must be 5 MB or smaller." };

  const ext = file.name.toLowerCase().split(".").pop();
  if (ext !== "pdf" && ext !== "docx") return { ok: false, error: "Resume must be a PDF or DOCX file." };

  const type = TYPES[ext];
  if (file.type && file.type !== type.mime && file.type !== "application/octet-stream") {
    return { ok: false, error: "That file's type doesn't match its extension." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!type.magic.every((b, i) => bytes[i] === b)) {
    return { ok: false, error: "That file doesn't look like a valid PDF or DOCX." };
  }
  return { ok: true, ext, bytes };
}

/** Saves under uploads/<userId>/<random>.<ext>; returns the path relative to the upload root. */
export async function saveResume(userId: string, ext: string, bytes: Buffer) {
  const rel = path.join(userId, `${randomUUID()}.${ext}`);
  const abs = path.join(uploadRoot(), rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, bytes, { flag: "wx" });
  return rel;
}

export async function deleteResume(rel: string | null | undefined) {
  if (!rel) return;
  const root = uploadRoot();
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) return; // never delete outside the upload root
  await unlink(abs).catch(() => {});
}
