"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { checkSetupFilesAction, importSetupFilesAction } from "@/app/(app)/setup/actions";
import { plural } from "@/components/import/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { SetupPlan, SheetIssue } from "@/lib/setup-import";
import { SetupPreview } from "./setup-preview";

/** Each file at most 1 MB, the same limit as the server. */
const MAX_BYTES = 1_000_000;
const FILE_NAMES = { ingredients: "ingredients.csv", recipes: "recipes.csv" } as const;

type Texts = { ingredients: string | null; recipes: string | null };

/** "Line 7 of recipes.csv: message", or "recipes.csv: message" for the whole file. */
export function issueText(issue: SheetIssue): string {
  const file = FILE_NAMES[issue.sheet];
  return issue.line === null ? `${file}: ${issue.message}` : `Line ${issue.line} of ${file}: ${issue.message}`;
}

export function IssueAlerts({ issues }: { issues: SheetIssue[] }) {
  const errors = issues.filter((issue) => !issue.warning);
  const warnings = issues.filter((issue) => issue.warning);
  return (
    <>
      {errors.length > 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium">
              {plural(errors.length, "problem stops", "problems stop")} the import. Fix the file and check it again.
            </p>
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
              {errors.map((issue, index) => (
                <li key={index}>{issueText(issue)}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {warnings.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden />
          <AlertDescription>
            <p className="font-medium">Good to know</p>
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
              {warnings.map((issue, index) => (
                <li key={index}>{issueText(issue)}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

export function SetupFlow() {
  const uid = useId();
  const ingredientsInput = useRef<HTMLInputElement>(null);
  const recipesInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [files, setFiles] = useState<{ ingredients: File | null; recipes: File | null }>({
    ingredients: null,
    recipes: null,
  });
  const [checked, setChecked] = useState<{ texts: Texts; plan: SetupPlan } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<SheetIssue[]>([]);
  const [done, setDone] = useState<string | null>(null);

  function chooseFile(which: "ingredients" | "recipes", file: File | undefined) {
    // Changing a file clears the earlier result.
    setChecked(null);
    setMessage(null);
    setIssues([]);
    setDone(null);
    if (file && file.size > MAX_BYTES) {
      setFiles((current) => ({ ...current, [which]: null }));
      setMessage(`${FILE_NAMES[which]} is larger than 1 MB. Split it into smaller files.`);
      const input = which === "ingredients" ? ingredientsInput.current : recipesInput.current;
      if (input) input.value = "";
      return;
    }
    setFiles((current) => ({ ...current, [which]: file ?? null }));
  }

  function reset() {
    setFiles({ ingredients: null, recipes: null });
    setChecked(null);
    setIssues([]);
    if (ingredientsInput.current) ingredientsInput.current.value = "";
    if (recipesInput.current) recipesInput.current.value = "";
  }

  function check() {
    setMessage(null);
    setIssues([]);
    setDone(null);
    setChecked(null);
    startTransition(async () => {
      let texts: Texts;
      try {
        texts = {
          ingredients: files.ingredients ? await files.ingredients.text() : null,
          recipes: files.recipes ? await files.recipes.text() : null,
        };
      } catch {
        setMessage("A file could not be read. Try saving it as CSV again.");
        return;
      }
      const response = await checkSetupFilesAction(texts);
      if (!response.ok) {
        setMessage(response.message);
        setIssues(response.issues ?? []);
        return;
      }
      setChecked({ texts, plan: response.plan });
    });
  }

  function importFiles() {
    if (!checked) return;
    setMessage(null);
    setIssues([]);
    startTransition(async () => {
      const response = await importSetupFilesAction(checked.texts);
      if (!response.ok) {
        // Back to step 2 with the reason; the files are checked again.
        setMessage(response.message);
        setIssues(response.issues ?? []);
        setChecked(null);
        return;
      }
      toast.success("Setup imported.");
      setDone(response.message);
      setChecked(null);
      reset();
    });
  }

  const hasFile = files.ingredients !== null || files.recipes !== null;
  const blocked = checked ? checked.plan.issues.some((issue) => !issue.warning) : false;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm md:p-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Step 2: Check your files</h2>
          <p className="text-sm text-muted-foreground">
            Choose one file or both. Nothing is saved until you press Import.
          </p>
        </div>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${uid}-ingredients`}>Ingredients file</FieldLabel>
              <Input
                ref={ingredientsInput}
                id={`${uid}-ingredients`}
                type="file"
                accept=".csv,text/csv"
                disabled={pending}
                onChange={(event) => chooseFile("ingredients", event.target.files?.[0])}
              />
              <FieldDescription>ingredients.csv</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${uid}-recipes`}>Recipes file</FieldLabel>
              <Input
                ref={recipesInput}
                id={`${uid}-recipes`}
                type="file"
                accept=".csv,text/csv"
                disabled={pending}
                onChange={(event) => chooseFile("recipes", event.target.files?.[0])}
              />
              <FieldDescription>recipes.csv</FieldDescription>
            </Field>
          </div>
        </FieldGroup>
        {message ? (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {!checked && issues.length > 0 ? <IssueAlerts issues={issues} /> : null}
        <div>
          <Button type="button" variant="outline" size="lg" disabled={!hasFile || pending} onClick={check}>
            {pending && !checked ? "Checking…" : "Check files"}
          </Button>
        </div>
      </section>

      {done ? (
        <section className="flex flex-col items-start gap-4 rounded-lg border border-border bg-card p-5 shadow-sm md:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CircleCheck className="size-5 shrink-0 text-success-foreground" aria-hidden />
            Done
          </h2>
          <p role="status" className="text-sm">
            {done}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/ingredients" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Ingredients
            </Link>
            <Link href="/menu" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Menu
            </Link>
          </div>
        </section>
      ) : null}

      {checked ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Step 3: Check the preview</h2>
          <IssueAlerts issues={checked.plan.issues} />
          <SetupPreview plan={checked.plan} />
          <div className="flex flex-col gap-2">
            <div>
              <Button type="button" size="lg" disabled={blocked || pending} onClick={importFiles}>
                {pending ? "Importing…" : "Import"}
              </Button>
            </div>
            {blocked ? <p className="text-sm text-muted-foreground">Fix the problems above to import.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
