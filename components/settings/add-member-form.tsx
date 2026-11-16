"use client";

import { useActionState, useId, useState } from "react";
import { inviteMember, type InviteState } from "@/app/(app)/settings/actions";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { MemberRole } from "@/lib/db/schema/enums";
import { emptyFormState } from "@/lib/validation/form";
import { MEMBER_ROLES } from "@/lib/validation/team";
import { AccessLinkBox } from "./access-link-box";

export function AddMemberForm() {
  // Unique per form: Next.js keeps earlier screens in the page (hidden), and two
  // forms with the same field ids would cross their labels.
  const uid = useId();
  // Controlled: React resets uncontrolled fields after every action, failed ones included.
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("staff");
  const [state, formAction, pending] = useActionState<InviteState, FormData>(async (previous, formData) => {
    const result = await inviteMember(previous, formData);
    // Ready for the next person once this one is on the team.
    if (result.ok) setEmail("");
    return result;
  }, emptyFormState);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        {state.ok ? <AccessLinkBox state={state} /> : <FormMessage state={state} />}
        <Field data-invalid={Boolean(state.errors?.email)}>
          <FieldLabel htmlFor={`${uid}-member-email`}>E-mail</FieldLabel>
          <Input
            id={`${uid}-member-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            className="h-11"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <FieldError errors={fieldErrors(state, "email")} />
        </Field>
        <Field data-invalid={Boolean(state.errors?.role)}>
          <FieldLabel htmlFor={`${uid}-member-role`}>Role</FieldLabel>
          <Select name="role" value={role} onValueChange={(value) => setRole(value as MemberRole)}>
            <SelectTrigger id={`${uid}-member-role`} className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBER_ROLES.map((value) => (
                <SelectItem key={value} value={value}>
                  {ROLE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={fieldErrors(state, "role")} />
        </Field>
        <Button type="submit" size="lg" disabled={pending} className="h-11 sm:w-fit">
          {pending ? "Adding…" : "Add to team"}
        </Button>
      </FieldGroup>
    </form>
  );
}
