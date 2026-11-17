import { Store } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-md text-lg font-semibold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store className="size-5" aria-hidden />
          </span>
          Restaurant Inventory
        </Link>
        {children}
      </div>
    </main>
  );
}
