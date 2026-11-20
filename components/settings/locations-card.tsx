"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addLocationAction } from "@/app/(app)/locations/actions";
import { FormMessage, fieldErrors } from "@/components/form-message";
import { useSwitchLocation } from "@/components/shell/use-switch-location";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGES_CACHE } from "@/lib/pwa/caches";
import { emptyFormState, type FormState } from "@/lib/validation/form";
import { locationFormSchema } from "@/lib/validation/locations";

export type LocationRow = { locationId: string; locationName: string; timezone: string };

/**
 * Locations of this organization: switch between them, or add one. Its own card,
 * so its filled "Add location" button is the only filled one in the card.
 */
export function LocationsCard({
  locations,
  currentId,
  defaultTimezone,
  timezones,
}: {
  locations: LocationRow[];
  currentId: string;
  defaultTimezone: string;
  timezones: string[];
}) {
  const uid = useId();
  const router = useRouter();
  const { switchTo, pending: switching, switchingId } = useSwitchLocation();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [state, setState] = useState<FormState>(emptyFormState);
  const [adding, startAdding] = useTransition();

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = locationFormSchema.safeParse({ name, timezone });
    if (!parsed.success) {
      setState({
        ok: false,
        message: "Please check the highlighted fields.",
        errors: Object.fromEntries(
          Object.entries(parsed.error.flatten().fieldErrors).map(([key, messages]) => [key, messages ?? []]),
        ),
      });
      return;
    }
    startAdding(async () => {
      try {
        if ("caches" in window) await caches.delete(PAGES_CACHE);
      } catch {
        // Storage blocked: nothing was kept either.
      }
      const result = await addLocationAction(parsed.data);
      setState(result);
      if (result.ok) {
        setName("");
        toast.success(result.message ?? "Location added.");
        router.push("/dashboard");
      }
    });
  }

  const zones = timezones.includes(timezone) ? timezones : [timezone, ...timezones];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Locations</CardTitle>
        <CardDescription>
          Each location has its own ingredients, menu, team and counts. You become the owner of the new location; add
          its team under Settings while you are working in it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {locations.map((location) => (
            <li key={location.locationId} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{location.locationName}</p>
                <p className="text-xs text-muted-foreground">{location.timezone}</p>
              </div>
              {location.locationId === currentId ? (
                <Badge variant="neutral">Current</Badge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={switching}
                  onClick={() => switchTo(location.locationId)}
                  aria-label={`Switch to ${location.locationName}`}
                >
                  {switchingId === location.locationId ? "Switching…" : "Switch"}
                </Button>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={add} noValidate>
          <FieldGroup>
            <p className="text-sm font-medium">Add a location</p>
            <FormMessage state={state} />
            <Field data-invalid={Boolean(state.errors?.name)}>
              <FieldLabel htmlFor={`${uid}-location-name`}>Location name</FieldLabel>
              <Input
                id={`${uid}-location-name`}
                name="name"
                autoComplete="off"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <FieldError errors={fieldErrors(state, "name")} />
            </Field>
            <Field data-invalid={Boolean(state.errors?.timezone)}>
              <FieldLabel htmlFor={`${uid}-location-timezone`}>Location timezone</FieldLabel>
              <Select name="timezone" value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id={`${uid}-location-timezone`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={fieldErrors(state, "timezone")} />
            </Field>
            <Button type="submit" size="lg" disabled={adding} className="sm:w-fit">
              {adding ? "Adding…" : "Add location"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
