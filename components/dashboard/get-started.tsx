import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  { href: "/ingredients", title: "Ingredients", text: "What you buy, with cost and pack sizes." },
  { href: "/menu", title: "Menu and recipes", text: "Give each item the ingredients one sale uses." },
  { href: "/import", title: "Import sales", text: "Upload the sales CSV from your POS." },
  { href: "/ingredients", title: "Stock", text: 'The "In stock" column shows what should be on the shelf.' },
  { href: "/count", title: "Count", text: "Count what is really there. A manager approves it." },
  { href: "/unexplained-usage", title: "Unexplained usage", text: "The gap, in units and euros." },
];

export function GetStarted() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Get started</CardTitle>
        <CardDescription>Six steps from your POS sales to what is missing from the shelf.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="-mx-2 flex flex-col">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Link
                href={step.href}
                className="group flex min-h-14 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-row-hover focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{step.title}</span>
                  <span className="block text-sm text-muted-foreground">{step.text}</span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-5 shrink-0 text-muted-foreground group-hover:text-foreground"
                />
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export function StaffStart() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Count the stock</CardTitle>
        <CardDescription>
          Count what is on the shelf with the Count stock button above. A manager approves it afterwards.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
