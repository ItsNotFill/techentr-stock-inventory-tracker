"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { checkRole } from "@/lib/auth/membership";
import { ALL_ROLES, MANAGER_ROLES } from "@/lib/auth/roles";
import {
  approveCount,
  clampCountTime,
  CountError,
  deleteDraftCount,
  getCountSubmission,
  rejectCount,
  saveCountEntries,
  startCount,
  submitCount,
} from "@/lib/counts";
import { withUser } from "@/lib/db/client";
import { countEntriesSchema, reviewNoteSchema } from "@/lib/validation/counts";
import { formError, PERMISSION_DENIED, type FormState } from "@/lib/validation/form";
import { idSchema } from "@/lib/validation/ingredients";

// Server Actions for the stock count screens. Anyone on the team counts;
// owners and managers approve or reject. Every action checks the role again,
// validates its input, and runs through the RLS client.

function toFormState(error: unknown): FormState {
  if (error instanceof CountError) {
    return error.field
      ? { ok: false, message: "Please check the highlighted ingredient.", errors: { [error.field]: [error.message] } }
      : formError(error.message);
  }
  throw error;
}

function parseEntries(entries: unknown) {
  const parsed = countEntriesSchema.safeParse(entries);
  return parsed.success ? parsed.data : null;
}

/**
 * Starts a count, or returns the user's open draft. `clientId` is a random
 * uuid made in the browser (crypto.randomUUID()): a retried tap does not
 * start a second count.
 */
export async function startCountAction(clientId: string): Promise<FormState & { id?: string }> {
  const membership = await checkRole(ALL_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const parsedClientId = idSchema.safeParse(clientId);
  if (!parsedClientId.success) return formError("Could not start the count. Reload the page and try again.");
  try {
    const id = await withUser((tx) => startCount(tx, membership.locationId, membership.userId, parsedClientId.data));
    return { ok: true, id };
  } catch (error) {
    return toFormState(error);
  }
}

/**
 * Saves what was typed so far. `entries`: `[{ ingredientId, amount, unit }]`
 * for the ingredients that changed; `amount` as typed ("1,5"), "" to clear;
 * `unit` a display unit (g, kg, ml, cl, l, unit) or "pack:<pack size id>".
 * Errors for one entry come back as `errors["entries.<index>"]`.
 */
export async function saveCountAction(sessionId: string, entries: unknown): Promise<FormState> {
  const membership = await checkRole(ALL_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(sessionId);
  const parsed = parseEntries(entries);
  if (!id.success || !parsed) return formError("Could not save the count. Reload the page and try again.");
  try {
    await withUser((tx) => saveCountEntries(tx, membership.locationId, membership.userId, id.data, parsed));
    return { ok: true, message: "Saved." };
  } catch (error) {
    return toFormState(error);
  }
}

const tappedAtSchema = z.iso.datetime({ offset: true }).nullable();

/**
 * Saves the last entries and submits the count. The count time is now, or,
 * for a submit tapped on a phone without signal and sent later,
 * `countedAt` (the phone's time of the tap, ISO), kept between the count's
 * start and now (DECISIONS.md 71, 94). With `approve` true, an owner or
 * manager approves it in the same step (DECISIONS.md 8); for anyone else
 * `approve` is refused.
 *
 * A retry of a submit that already went through (the answer was lost on the
 * way) succeeds without doing anything again.
 */
export async function submitCountAction(
  sessionId: string,
  entries: unknown,
  approve = false,
  countedAt: string | null = null,
): Promise<FormState> {
  const membership = await checkRole(ALL_ROLES);
  if (!membership) return PERMISSION_DENIED;
  if (approve && !MANAGER_ROLES.includes(membership.role)) return PERMISSION_DENIED;
  const id = idSchema.safeParse(sessionId);
  const parsed = parseEntries(entries);
  const tappedAt = tappedAtSchema.safeParse(countedAt);
  if (!id.success || !parsed || !tappedAt.success) return formError("Could not submit the count. Reload the page and try again.");
  try {
    const outcome = await withUser(async (tx) => {
      const current = await getCountSubmission(tx, membership.locationId, id.data);
      if (current && current.countedBy === membership.userId && (current.status === "submitted" || current.status === "approved")) {
        return "already" as const;
      }
      await saveCountEntries(tx, membership.locationId, membership.userId, id.data, parsed);
      const countTime =
        tappedAt.data && current ? clampCountTime(new Date(tappedAt.data), current.startedAt) : new Date();
      await submitCount(tx, membership.locationId, membership.userId, id.data, countTime);
      if (approve) await approveCount(tx, membership.locationId, membership.userId, id.data);
      return "submitted" as const;
    });
    refresh();
    if (outcome === "already") return { ok: true, message: "This count was already submitted." };
    return {
      ok: true,
      message: approve ? "Count submitted and approved. Stock now matches what you counted." : "Count submitted. A manager will review it.",
    };
  } catch (error) {
    return toFormState(error);
  }
}

/** Approves a submitted count: stock is set to what was counted, as of the count time. */
export async function approveCountAction(sessionId: string): Promise<FormState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(sessionId);
  if (!id.success) return formError("This count no longer exists.");
  try {
    const result = await withUser((tx) => approveCount(tx, membership.locationId, membership.userId, id.data));
    refresh();
    return {
      ok: true,
      message:
        result.openingLines > 0
          ? `Count approved. ${result.openingLines} ${result.openingLines === 1 ? "ingredient was" : "ingredients were"} counted for the first time: that is the starting stock.`
          : "Count approved. Stock now matches what was counted.",
    };
  } catch (error) {
    return toFormState(error);
  }
}

/** Rejects a submitted count with an optional note for the person who counted. Stock does not change. */
export async function rejectCountAction(sessionId: string, note: string): Promise<FormState> {
  const membership = await checkRole(MANAGER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(sessionId);
  const parsedNote = reviewNoteSchema.safeParse(typeof note === "string" ? note : "");
  if (!id.success) return formError("This count no longer exists.");
  if (!parsedNote.success) return { ok: false, message: "Please check the note.", errors: { note: [parsedNote.error.issues[0].message] } };
  try {
    await withUser((tx) => rejectCount(tx, membership.locationId, membership.userId, id.data, parsedNote.data));
    refresh();
    return { ok: true, message: "Count rejected. Stock did not change." };
  } catch (error) {
    return toFormState(error);
  }
}

/** Throws away a draft (the person who started it, or an owner or manager). */
export async function deleteDraftAction(sessionId: string): Promise<FormState> {
  const membership = await checkRole(ALL_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(sessionId);
  if (!id.success) return formError("This draft no longer exists.");
  try {
    await withUser((tx) => deleteDraftCount(tx, membership.locationId, id.data));
    return { ok: true, message: "Draft deleted." };
  } catch (error) {
    return toFormState(error);
  }
}
