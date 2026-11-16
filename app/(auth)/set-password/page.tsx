import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Choose a password" };

// Reached through a one-time link (invite or new-password link). The proxy
// only lets signed-in users in, and the action checks the user again.
export default function SetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a password</CardTitle>
        <CardDescription>You will use it with your e-mail address to log in from now on.</CardDescription>
      </CardHeader>
      <CardContent>
        <SetPasswordForm />
      </CardContent>
    </Card>
  );
}
