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
  name: z.string().trim().min(1, "Enter a name.").max(100, "Name is too long."),
  university: z.string().trim().min(1, "Enter a university.").max(120, "University is too long."),
  // Set when the user confirms "yes, that's the same person" after a duplicate-name conflict.
  linkExistingId: z.string().trim().min(1).max(64).optional(),
});

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;
