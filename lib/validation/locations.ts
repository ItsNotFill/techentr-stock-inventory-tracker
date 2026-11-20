import { z } from "zod";

/** A new location: its name and IANA timezone (the database checks the timezone too). */
export const locationFormSchema = z.object({
  name: z.string().trim().min(1, "Enter the location's name.").max(80, "Use at most 80 characters."),
  timezone: z.string().trim().min(1, "Choose a timezone.").max(64),
});

export type LocationFormValues = z.infer<typeof locationFormSchema>;
