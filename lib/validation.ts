import { z } from "zod";

export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email is too long.")
    .email("Enter a valid email address."),
  // bcrypt only uses the first 72 bytes, so cap there.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password must be 72 characters or fewer."),
});

const longText = (label: string) => z.string().trim().max(4000, `${label} must be 4000 characters or fewer.`);

export const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name.").max(100, "Name is too long."),
  university: z.string().trim().max(120, "University is too long."),
  workExperience: longText("Work experience"),
  projects: longText("Projects"),
  education: longText("Education"),
  interests: longText("Interests"),
});

export const goalSchema = z.object({
  goal: z.string().trim().min(3, "Tell us a little more about your goal.").max(1000, "Keep your goal under 1000 characters."),
});

export const personSchema = z.object({
  // Inner whitespace is collapsed the same way the team backend stores names, so the two always match.
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(100, "Name is too long.")
    .transform((value) => value.split(/\s+/).join(" ")),
  university: z.string().trim().min(1, "Enter a university.").max(120, "University is too long."),
  // Set when the user confirms "yes, that's the same person" after a duplicate-name conflict.
  linkExistingId: z.string().trim().min(1).max(64).optional(),
});

const chatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(10_000),
});

export const practiceTurnSchema = z.object({
  message: z.string().trim().min(1, "Say something first.").max(2000, "Keep it under 2000 characters."),
  history: z.array(chatMessage).max(30),
});
export const feedbackSchema = z.object({ transcript: z.array(chatMessage).min(1).max(60) });

export const researchSchema = z.object({
  // Optional: pick a specific public profile when the first search returned several candidates.
  profileUrl: z
    .string()
    .trim()
    .url()
    .max(1500)
    .refine((u) => u.startsWith("https://"), "Use an https link.")
    .optional(),
});
export const questionsSchema = z.object({ briefId: z.string().trim().min(1).max(64) });

const brainDumpCard = z.object({
  category: z.string().trim().min(1).max(60),
  text: z.string().trim().min(1).max(2000),
  selected: z.boolean(),
});
const introduction = z.object({
  name: z.string().trim().min(1).max(120),
  affiliation: z.string().trim().max(180).default(""),
  context: z.string().trim().max(2000),
  existing_person_id: z.string().max(64).nullable().optional(),
});
export const extractSchema = z.object({ transcript: z.string().trim().min(1, "Write a few words first.").max(10_000) });
export const confirmSchema = extractSchema.extend({
  cards: z.array(brainDumpCard).max(60),
  introductions: z.array(introduction).max(10),
});

export const followUpActionSchema = z.object({
  action: z.enum(["done", "dismiss", "snooze", "restore"]),
  days: z.union([z.literal(1), z.literal(3), z.literal(7)]).default(1),
});

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
