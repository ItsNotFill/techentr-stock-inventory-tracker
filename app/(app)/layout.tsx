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
      {/* On a phone, room at the bottom so the tab bar never covers the end of the page. */}
      <main className="min-w-0 flex-1 px-4 pt-5 pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+2rem)] md:px-8 md:pt-8 md:pb-12 lg:px-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
