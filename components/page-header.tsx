import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/**
 * The top of every screen: an optional way back, the title (with an optional
 * status badge next to it), one line saying what the screen is for, and the
 * screen's main action on the right. On a phone the action sits under the text.
 */
export function PageHeader({
  title,
  description,
  back,
  badge,
  children,
}: {
  title: string;
  description?: string;
  /** A link back to the list this screen belongs to. */
  back?: { href: string; label: string };
  /** A status shown next to the title, e.g. "Has recipe". */
  badge?: React.ReactNode;
  /** The main action (usually one button). */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {back ? (
          <Link
            href={back.href}
            className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 rounded-md pr-2 text-sm font-medium text-primary hover:text-primary-hover hover:underline hover:underline-offset-4 md:min-h-8"
          >
            <ChevronLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words text-foreground">
            {title}
          </h1>
          {badge}
        </div>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          {children}
        </div>
      ) : null}
    </div>
  );
}
