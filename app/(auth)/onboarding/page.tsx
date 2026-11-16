import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentMembership } from "@/lib/auth/membership";
import { requireUser } from "@/lib/auth/session";
import { signOut } from "../actions";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your restaurant" };

export default function OnboardingPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your restaurant</CardTitle>
        <CardDescription>One more step: tell us what your restaurant is called. You will be its owner.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <OnboardingContent />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function OnboardingContent() {
  const user = await requireUser();
  // Invited users and returning owners already have a restaurant.
  if (await getCurrentMembership()) redirect("/dashboard");

  return (
    <>
      <OnboardingForm />
      <form action={signOut} className="text-center text-sm text-muted-foreground">
        Signed in as {user.email ?? "unknown"}.{" "}
        <Button type="submit" variant="link" className="h-auto p-0">
          Log out
        </Button>
      </form>
    </>
  );
}
