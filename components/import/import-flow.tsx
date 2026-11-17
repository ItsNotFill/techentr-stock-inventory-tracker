"use client";

import { CircleCheck, Upload } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  analyzeSalesCsv,
  confirmSalesImport,
  previewSalesImport,
  type AnalyzeResult,
  type PreviewResult,
} from "@/app/(app)/import/actions";
import { SELECT_HEIGHT } from "@/components/ingredients/units";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ImportResult } from "@/lib/imports";
import {
  DATE_FORMAT_LABELS,
  DATE_FORMATS,
  DECIMAL_SEPARATORS,
  MAX_CSV_BYTES,
  type ColumnMap,
  type DateFormat,
} from "@/lib/validation/imports";
import { formatDateTime, plural } from "./format";

type Analysis = Extract<AnalyzeResult, { ok: true }>;
type Preview = Extract<PreviewResult, { ok: true }>;

/** What the user has chosen. Empty string = nothing chosen yet. */
type Choice = {
  orderId: string;
  itemName: string;
  quantity: string;
  soldAt: string;
  soldAtTime: string;
  itemId: string;
  dateFormat: DateFormat;
  decimalSeparator: (typeof DECIMAL_SEPARATORS)[number];
};

const NONE = "__none__";
const STEPS = ["File", "Columns", "Check and import"];
const TOO_LARGE = "This file is too large. Split it into smaller periods, for example one week per file.";

type ColumnField = "orderId" | "itemName" | "quantity" | "soldAt" | "soldAtTime" | "itemId";

const COLUMN_FIELDS: { key: ColumnField; label: string; required: boolean; help?: string; none?: string }[] = [
  { key: "orderId", label: "Order or receipt number", required: true },
  { key: "itemName", label: "Item name", required: true },
  { key: "quantity", label: "Quantity", required: true },
  { key: "soldAt", label: "Date", required: true, help: "The date, or date and time together" },
  { key: "soldAtTime", label: "Time (optional)", required: false, none: "No separate time column" },
  {
    key: "itemId",
    label: "Item id (optional)",
    required: false,
    none: "No item id column",
    help: "Only if the export has an id per item",
  },
];

function initialChoice(map: Analysis["map"]): Choice {
  return {
    orderId: map.orderId ?? "",
    itemName: map.itemName ?? "",
    quantity: map.quantity ?? "",
    soldAt: map.soldAt ?? "",
    soldAtTime: map.soldAtTime ?? "",
    itemId: map.itemId ?? "",
    dateFormat: map.dateFormat ?? "iso",
    decimalSeparator: map.decimalSeparator ?? ".",
  };
}

function toColumnMap(choice: Choice): ColumnMap {
  return {
    orderId: choice.orderId,
    itemName: choice.itemName,
    quantity: choice.quantity,
    soldAt: choice.soldAt,
    soldAtTime: choice.soldAtTime || null,
    itemId: choice.itemId || null,
    dateFormat: choice.dateFormat,
    decimalSeparator: choice.decimalSeparator,
  };
}

/** Numbered steps: the current one filled in the accent colour, done ones tinted. */
function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm" aria-label="Steps">
      {STEPS.map((label, index) => {
        const current = index === step;
        const done = index < step;
        return (
          <li key={label} aria-current={current ? "step" : undefined} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                current
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-accent text-accent-foreground"
                    : "border border-input bg-card text-muted-foreground",
              )}
            >
              {index + 1}
            </span>{" "}
            <span className={current ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</span>
            {index < STEPS.length - 1 ? <span className="mx-1 h-px w-5 bg-border-strong sm:w-8" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function ImportFlow({ timeZone }: { timeZone: string }) {
  const uid = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [dragging, setDragging] = useState(false);

  function reset() {
    setStep(0);
    setCsvText("");
    setFileName("");
    setAnalysis(null);
    setChoice(null);
    setPreview(null);
    setResult(null);
    setMessage(null);
    setErrors({});
    setDragging(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    if (file.size > MAX_CSV_BYTES) {
      setMessage(TOO_LARGE);
      return;
    }
    startTransition(async () => {
      let text: string;
      try {
        text = await file.text();
      } catch {
        setMessage("This file could not be read. Try exporting it again.");
        return;
      }
      const response = await analyzeSalesCsv(text);
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      setCsvText(text);
      setFileName(file.name);
      setAnalysis(response);
      setChoice(initialChoice(response.map));
      setPreview(null);
      setErrors({});
      setStep(1);
    });
  }

  function checkFile() {
    if (!choice) return;
    setMessage(null);
    setErrors({});
    startTransition(async () => {
      const response = await previewSalesImport(csvText, toColumnMap(choice));
      if (!response.ok) {
        setMessage(response.message);
        setErrors(response.errors ?? {});
        return;
      }
      setPreview(response);
      setStep(2);
    });
  }

  function confirm() {
    if (!choice) return;
    setMessage(null);
    startTransition(async () => {
      const response = await confirmSalesImport(csvText, toColumnMap(choice), fileName);
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      toast.success(`Imported ${plural(response.result.ordersImported, "order", "orders")}.`);
      setCsvText("");
      setResult(response.result);
    });
  }

  if (result) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-xl border border-success-border bg-card p-5 shadow-xs md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
          Imported {plural(result.ordersImported, "order", "orders")} ({plural(result.linesImported, "line", "lines")})
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {result.ordersSkipped > 0 ? (
            <li>
              {plural(result.ordersSkipped, "order was", "orders were")} already imported and skipped.
            </li>
          ) : null}
          {result.linesDepleted > 0 ? <li>{plural(result.linesDepleted, "line", "lines")} used stock.</li> : null}
          {result.linesWaiting > 0 ? (
            <li>{plural(result.linesWaiting, "line waits", "lines wait")} for a recipe.</li>
          ) : null}
          {result.itemsCreated.length > 0 ? (
            <li>New items added to the menu: {result.itemsCreated.join(", ")}.</li>
          ) : null}
        </ul>
        <div className="flex flex-wrap gap-2">
          {result.linesWaiting > 0 ? (
            <Button asChild size="lg">
              <Link href="/unmapped">Add recipes</Link>
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="lg" onClick={reset}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border-strong bg-card p-4 shadow-xs md:p-6">
      <StepIndicator step={step} />
      {message ? (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Export the sales per item from your POS as a CSV file. Each row is one item on one order.
          </p>
          <label
            htmlFor={`${uid}-file`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!pending) handleFile(event.dataTransfer.files[0]);
            }}
            className={cn(
              "group flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
              dragging ? "border-primary bg-accent" : "border-border-strong hover:border-primary hover:bg-accent/50",
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-accent text-primary">
              <Upload className="size-5" aria-hidden />
            </span>
            <span className={buttonVariants({ size: "lg", className: "pointer-events-none" })}>
              {pending ? "Reading the file…" : "Choose a CSV file"}
            </span>
            <span className="text-sm text-muted-foreground">Tap here, or drop the file on this box</span>
            <input
              ref={fileInput}
              id={`${uid}-file`}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              disabled={pending}
              onChange={(event) => {
                handleFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      {step === 1 && analysis && choice ? (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            {analysis.mapSource === "saved"
              ? "Using the columns from your last import. Check them and continue."
              : "We guessed the columns from the file. Check them before you continue."}{" "}
            {fileName ? `File: ${fileName}, ${plural(analysis.rowCount, "row", "rows")}.` : null}
          </p>
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-2">
              {COLUMN_FIELDS.map((field) => {
                const value = choice[field.key];
                const taken = new Set(
                  COLUMN_FIELDS.filter((other) => other.key !== field.key).map((other) => choice[other.key]),
                );
                const fieldErrors = errors[field.key];
                return (
                  <Field key={field.key} data-invalid={fieldErrors ? true : undefined}>
                    <FieldLabel htmlFor={`${uid}-${field.key}`}>{field.label}</FieldLabel>
                    <Select
                      value={value === "" && !field.required ? NONE : value}
                      onValueChange={(next) =>
                        setChoice({ ...choice, [field.key]: next === NONE ? "" : next })
                      }
                    >
                      <SelectTrigger
                        id={`${uid}-${field.key}`}
                        className={SELECT_HEIGHT}
                        aria-invalid={fieldErrors ? true : undefined}
                      >
                        <SelectValue placeholder="Choose a column" />
                      </SelectTrigger>
                      <SelectContent>
                        {field.none ? <SelectItem value={NONE}>{field.none}</SelectItem> : null}
                        {analysis.headers.map((header) => (
                          <SelectItem key={header} value={header} disabled={taken.has(header)}>
                            {header}
                            {taken.has(header) ? " (used for another field)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.help ? <FieldDescription>{field.help}</FieldDescription> : null}
                    {fieldErrors?.map((error) => <FieldError key={error}>{error}</FieldError>)}
                  </Field>
                );
              })}

              <Field>
                <FieldLabel htmlFor={`${uid}-dateFormat`}>Date format</FieldLabel>
                <Select
                  value={choice.dateFormat}
                  onValueChange={(next) => setChoice({ ...choice, dateFormat: next as DateFormat })}
                >
                  <SelectTrigger id={`${uid}-dateFormat`} className={SELECT_HEIGHT}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>
                        {DATE_FORMAT_LABELS[format]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor={`${uid}-decimalSeparator`}>Decimal separator</FieldLabel>
                <Select
                  value={choice.decimalSeparator}
                  onValueChange={(next) =>
                    setChoice({ ...choice, decimalSeparator: next as Choice["decimalSeparator"] })
                  }
                >
                  <SelectTrigger id={`${uid}-decimalSeparator`} className={SELECT_HEIGHT}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=".">1.5 (dot)</SelectItem>
                    <SelectItem value=",">1,5 (comma)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">First rows of the file</p>
            <div className="max-w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    {analysis.headers.map((header) => (
                      <TableHead key={header} className="whitespace-nowrap">
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.sampleRows.map((row, index) => (
                    <TableRow key={index}>
                      {analysis.headers.map((header) => (
                        <TableCell key={header} className="whitespace-nowrap">
                          {row[header]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => {
                setMessage(null);
                setErrors({});
                setStep(0);
              }}
            >
              Back
            </Button>
            <Button type="button" size="lg" disabled={pending} onClick={checkFile}>
              {pending ? "Checking…" : "Check file"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 && preview ? (
        <CheckStep
          preview={preview}
          timeZone={timeZone}
          pending={pending}
          onBack={() => {
            setMessage(null);
            setStep(1);
          }}
          onConfirm={confirm}
        />
      ) : null}
    </div>
  );
}

function CheckStep({
  preview,
  timeZone,
  pending,
  onBack,
  onConfirm,
}: {
  preview: Preview;
  timeZone: string;
  pending: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { orders, lines, newItems, period } = preview.preview;
  const { invalidRows, invalidRowCount } = preview;
  return (
    <div className="flex flex-col gap-5">
      {orders.new === 0 ? (
        <p className="font-medium">There is nothing new to import in this file.</p>
      ) : (
        <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-muted-foreground">
          <li className="font-medium">
            {plural(orders.new, "order", "orders")} to import ({plural(lines.toImport, "line", "lines")})
          </li>
          {period ? (
            <li>
              Sales from {formatDateTime(period.from, timeZone)} to {formatDateTime(period.to, timeZone)}
            </li>
          ) : null}
          <li>{plural(lines.willUseStock, "line", "lines")} will use stock</li>
          <li>{plural(lines.waitingForRecipe, "line waits", "lines wait")} for a recipe</li>
          <li>{plural(lines.ignored, "line is an ignored item", "lines are ignored items")}</li>
        </ul>
      )}
      {orders.alreadyImported > 0 ? (
        <p className="text-sm">
          {plural(orders.alreadyImported, "order", "orders")} already imported: they will be skipped.
        </p>
      ) : null}

      {newItems.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            New items found (they will be added to the menu without a recipe, and their sales wait until you add one):
          </p>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border-strong px-3 text-sm">
            {newItems.map((item) => (
              <li key={item.name} className="flex justify-between gap-3 py-2">
                <span className="min-w-0 break-words">{item.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{plural(item.lines, "line", "lines")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {invalidRowCount > 0 ? (
        <div className="flex flex-col gap-2">
          <Alert variant="warning">
            <AlertDescription>
              {plural(invalidRowCount, "row has", "rows have")} problems. The {orders.blocked}{" "}
              {orders.blocked === 1 ? "order" : "orders"} they belong to will not be imported. Fix the file and upload
              it again later: orders already imported are skipped.
              {invalidRowCount > invalidRows.length
                ? ` Only the first ${invalidRows.length} of ${invalidRowCount} are shown.`
                : ""}
            </AlertDescription>
          </Alert>
          <div className="max-w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">Line</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invalidRows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell className="text-right">{row.rowNumber}</TableCell>
                    <TableCell>{row.orderId ?? "–"}</TableCell>
                    <TableCell>{row.itemName ?? "–"}</TableCell>
                    <TableCell className="whitespace-normal">{row.errors.join(" ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onBack}>
          Back
        </Button>
        {orders.new > 0 ? (
          <Button type="button" size="lg" disabled={pending} onClick={onConfirm}>
            {pending ? "Importing…" : `Import ${plural(orders.new, "order", "orders")}`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
