"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { createMemberLink, removeTeamMember, setMemberRole, type InviteState } from "@/app/(app)/settings/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { MemberRole } from "@/lib/db/schema/enums";
import { MEMBER_ROLES } from "@/lib/validation/team";
import { AccessLinkBox } from "./access-link-box";

export type TeamRow = {
  userId: string;
  email: string;
  role: MemberRole;
  /** Already formatted on the server in the restaurant's timezone. */
  joined: string;
  isSelf: boolean;
};

export function TeamList({ members }: { members: TeamRow[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-mail</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>
                  <span className="font-medium">{member.email}</span>
                  {member.isSelf ? <span className="text-muted-foreground"> (you)</span> : null}
                  <span className="block text-table text-muted-foreground">Joined {member.joined}</span>
                </TableCell>
                <TableCell>
                  <RoleSelect member={member} />
                </TableCell>
                <TableCell>
                  <MemberActions member={member} className="justify-end md:flex-nowrap" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {members.map((member) => (
          <li key={member.userId} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
            <div className="min-w-0">
              <p className="font-medium break-all">
                {member.email}
                {member.isSelf ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
              </p>
              <p className="text-sm text-muted-foreground">Joined {member.joined}</p>
            </div>
            <RoleSelect member={member} className="w-full" />
            <MemberActions member={member} />
          </li>
        ))}
      </ul>
    </>
  );
}

function RoleSelect({ member, className }: { member: TeamRow; className?: string }) {
  const [role, setRole] = useOptimistic(member.role);
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      setRole(next as MemberRole);
      const result = await setMemberRole(member.userId, next);
      // On failure the optimistic value drops back to the real role.
      if (result.ok) toast.success(`${member.email} is now ${ROLE_LABELS[next as MemberRole].toLowerCase()}.`);
      else toast.error(result.message ?? "Could not change the role.");
    });
  }

  return (
    <Select value={role} onValueChange={change} disabled={pending}>
      <SelectTrigger className={`w-36 ${className ?? ""}`} aria-label={`Role of ${member.email}`}>
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
  );
}

function MemberActions({ member, className }: { member: TeamRow; className?: string }) {
  const [linkState, setLinkState] = useState<InviteState | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [linkPending, startLink] = useTransition();
  const [removePending, startRemove] = useTransition();

  function newLink() {
    startLink(async () => {
      const result = await createMemberLink(member.userId);
      if (result.ok) setLinkState(result);
      else toast.error(result.message ?? "Could not create a link.");
    });
  }

  function remove() {
    startRemove(async () => {
      const result = await removeTeamMember(member.userId);
      if (result.ok) toast.success(`${member.email} was removed from the team.`);
      else toast.error(result.message ?? "Could not remove this person.");
      setConfirmOpen(false);
    });
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      <Button
        type="button"
        variant="outline"
        className="flex-1 md:flex-none"
        onClick={newLink}
        disabled={linkPending}
      >
        {linkPending ? "Creating…" : "New login link"}
      </Button>
      <Button
        type="button"
        variant="destructive-outline"
        className="flex-1 md:flex-none"
        onClick={() => setConfirmOpen(true)}
      >
        Remove
      </Button>

      <Dialog open={linkState !== null} onOpenChange={(open) => !open && setLinkState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Login link</DialogTitle>
            <DialogDescription>For {member.email}</DialogDescription>
          </DialogHeader>
          {linkState ? <AccessLinkBox state={linkState} /> : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {member.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this restaurant straight away. Their past counts and logs stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removePending}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={remove} disabled={removePending}>
              {removePending ? "Removing…" : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
