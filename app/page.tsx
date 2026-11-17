import { Store } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
        <Store className="size-7" aria-hidden />
      </span>
      <div className="flex max-w-md flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Restaurant Inventory</h1>
        <p className="text-base text-muted-foreground md:text-lg">
          Know what your kitchen should have in stock from what it sold, and see the unexplained usage in euros.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <Button asChild size="lg">
          <Link href="/login">Log in</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/sign-up">Create an account</Link>
        </Button>
      </div>
    </main>
  );
}
