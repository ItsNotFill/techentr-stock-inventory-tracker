"use server";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createRestaurantForUser } from "@/lib/auth/bootstrap";
import { LOCATION_COOKIE } from "@/lib/auth/locations";
import { getCurrentUser } from "@/lib/auth/session";
import { getAdminDb } from "@/lib/db/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema, onboardingSchema, signUpSchema } from "@/lib/validation/auth";
import { formError, invalidForm, type FormState } from "@/lib/validation/form";
import { passwordSchema } from "@/lib/validation/team";

const SERVICE_UNREACHABLE =
  "The login service cannot be reached. Try again in a moment; if it keeps happening, the app's Supabase settings need checking.";

export async function login(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return invalidForm(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return formError("Confirm your e-mail address first. The link is in the e-mail we sent you.");
    }
    if (error.code === "invalid_credentials") return formError("Wrong e-mail address or password.");
    // Anything else is not the user's fault: say so instead of blaming the password.
    console.error("Login failed", error.name, error.code, error.status, error.message);
    return isAuthRetryableFetchError(error)
      ? formError(SERVICE_UNREACHABLE)
      : formError("Could not log in right now. Try again in a moment.");
  }
  redirect("/dashboard");
}

export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return invalidForm(parsed.error);

  const origin = (await headers()).get("origin");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: origin ? { emailRedirectTo: `${origin}/auth/confirm?next=/onboarding` } : undefined,
  });
  if (error) {
    if (error.code === "weak_password") return formError("Choose a stronger password.");
    if (error.code === "over_email_send_rate_limit") {
      return formError("Too many sign-ups right now. Try again in a few minutes.");
    }
    console.error("Sign-up failed", error.name, error.code, error.status, error.message);
    if (isAuthRetryableFetchError(error)) return formError(SERVICE_UNREACHABLE);
    return formError("Could not create the account. Try again.");
  }

  // With e-mail confirmation off, Supabase signs the user in straight away.
  if (data.session) redirect("/onboarding");

  // The same message whether or not the address was already registered,
  // so the form does not reveal who has an account.
  return {
    ok: true,
    message: "Check your inbox. Open the link in the e-mail to confirm your address, then log in.",
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // The chosen location belongs to this person (DECISIONS.md 98).
  (await cookies()).delete(LOCATION_COOKIE);
  redirect("/login");
}

/** First login: creates the organization, the first location and the owner membership. */
export async function completeOnboarding(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = onboardingSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return invalidForm(parsed.error);

  // The sign-up bootstrap is the one place the app uses the admin connection:
  // RLS lets nobody insert organizations or locations.
  await createRestaurantForUser(getAdminDb(), { userId: user.id, ...parsed.data });
  redirect("/dashboard");
}

/** After an invite or new-password link: the signed-in user chooses a password. */
export async function setPassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = passwordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return invalidForm(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password") return formError("Choose a stronger password.");
    if (error.code === "same_password") return formError("Choose a password you have not used here before.");
    return formError("Could not save the password. Open the link again and retry.");
  }
  redirect("/dashboard");
}
