import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Restaurant Inventory</h1>
        <p className="text-muted-foreground">
          Know what your kitchen should have in stock from what it sold, and see the unexplained usage in euros.
        </p>
      </div>
      <div className="flex gap-3">
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
