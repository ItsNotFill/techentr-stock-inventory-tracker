import { z } from "zod";

const email = z.email("Enter a valid e-mail address.").trim().toLowerCase();

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
  email,
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters."),
});

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const onboardingSchema = z.object({
  restaurantName: z.string().trim().min(2, "Enter the restaurant's name.").max(80, "Use at most 80 characters."),
  timezone: z.string().refine(isTimezone, "Unknown timezone."),
});
