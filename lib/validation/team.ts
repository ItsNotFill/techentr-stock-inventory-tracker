import { z } from "zod";
import { optionalText } from "./quantity";

export const MEMBER_ROLES = ["owner", "manager", "staff"] as const;

export const inviteMemberSchema = z.object({
  email: z.email("Enter a valid e-mail address.").trim().toLowerCase(),
  role: z.enum(MEMBER_ROLES, "Choose a role."),
});

export const memberRoleSchema = z.enum(MEMBER_ROLES);

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const restaurantDetailsSchema = z.object({
  name: z.string().trim().min(2, "Enter the restaurant's name.").max(80, "Use at most 80 characters."),
  posProvider: optionalText(60),
  timezone: z.string().trim().refine(isTimezone, "Unknown timezone. Use a name like Europe/Amsterdam."),
});

export const passwordSchema = z.object({
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters."),
});
