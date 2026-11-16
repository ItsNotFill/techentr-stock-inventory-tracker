import { Suspense } from "react";
import { AppNav, AppNavSkeleton } from "@/components/shell/app-nav";

// The signed-in shell. The navigation reads the session, so it streams in
// behind its own boundary; each page wraps its own data the same way.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <Suspense fallback={<AppNavSkeleton />}>
        <AppNav />
      </Suspense>
      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8">{children}</main>
    </div>
  );
}
