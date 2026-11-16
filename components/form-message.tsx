import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FormState } from "@/lib/validation/form";

/** The general message of a form's state: an error, or a success note. */
export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert variant={state.ok ? "default" : "destructive"} aria-live="polite">
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

/** Field messages in the shape FieldError expects. */
export function fieldErrors(state: FormState, name: string): { message: string }[] | undefined {
  return state.errors?.[name]?.map((message) => ({ message }));
}
