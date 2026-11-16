import type { Metadata } from "next";
import { Suspense } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

const NOTICES: Record<string, string> = {
  confirmed: "Your e-mail address is confirmed. Log in to continue.",
  "link-failed": "That link did not work or has expired. Log in, or sign up again to get a new one.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Use the e-mail address your restaurant account is under.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Suspense fallback={null}>
          <Notice searchParams={searchParams} />
        </Suspense>
        <LoginForm />
      </CardContent>
    </Card>
  );
}

async function Notice({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { notice } = await searchParams;
  const text = typeof notice === "string" ? NOTICES[notice] : undefined;
  if (!text) return null;
  return (
    <Alert>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
