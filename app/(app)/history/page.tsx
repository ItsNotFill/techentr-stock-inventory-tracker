import { ChevronRight, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { amountTone } from "@/components/amount-tone";
import { EmptyState } from "@/components/empty-state";
import { HistoryFilters } from "@/components/history/filters";
import { Movements, signedQty } from "@/components/history/movements";
import { MetricCard, MetricGrid } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { movementType } from "@/lib/db/schema/enums";
import { getIngredient, listIngredients } from "@/lib/ingredients";
import { stockNow, stockOf } from "@/lib/ledger";
import { getIngredientHistory } from "@/lib/ledger/history";
import { formatQty } from "@/lib/units";
import { historyRange, historySearchSchema, MOVEMENT_TYPE_LABELS, type HistorySearch } from "@/lib/validation/history";

export const metadata: Metadata = { title: "Stock history" };

const LIST_DESCRIPTION = "Every stock movement of an ingredient: sales, deliveries, waste and counts.";

type Membership = Awaited<ReturnType<typeof requireRole>>;

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Stock history" description={LIST_DESCRIPTION} />
          <TableSkeleton />
        </>
      }
    >
      <HistoryContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HistoryContent({ searchParams }: { searchParams: PageProps<"/history">["searchParams"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const search = historySearchSchema.parse(await searchParams);
  if (!search.ingredient) return <IngredientList locationId={membership.locationId} />;
  return <IngredientHistory ingredientId={search.ingredient} search={search} membership={membership} />;
}

async function IngredientList({ locationId }: { locationId: string }) {
  const ingredients = await withUser((tx) => listIngredients(tx, locationId, { includeArchived: true }));
  return (
    <>
      <PageHeader title="Stock history" description={LIST_DESCRIPTION} />
      {ingredients.length === 0 ? (
        <EmptyState icon={History} title="No ingredients yet" description="Add an ingredient to see its stock movements here.">
          <Link href="/ingredients/new" className={buttonVariants()}>
            Add ingredient
          </Link>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {ingredients.map((ingredient) => (
            <li key={ingredient.id}>
              <Link
                href={`/history?ingredient=${ingredient.id}`}
                className="group flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary hover:bg-row-hover"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-semibold break-words">{ingredient.name}</span>
                  {ingredient.isActive ? null : <Badge variant="neutral">Archived</Badge>}
                </span>
                <ChevronRight className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function IngredientHistory({
  ingredientId,
  search,
  membership,
}: {
  ingredientId: string;
  search: HistorySearch;
  membership: Membership;
}) {
  const { from, before } = historyRange(search, membership.timezone);
  const data = await withUser(async (tx) => {
    const ingredient = await getIngredient(tx, membership.locationId, ingredientId);
    if (!ingredient) return null;
    const [history, stock] = await Promise.all([
      getIngredientHistory(tx, membership.locationId, ingredientId, {
        types: search.type ? [search.type] : undefined,
        from,
        before,
      }),
      stockNow(tx, membership.locationId, [ingredientId]),
    ]);
    return { ingredient, history, stock: stockOf(stock, ingredientId) };
  });
  if (!data) notFound();
  const { ingredient, history, stock } = data;
  const { baseUnit } = ingredient;
  const filtered = Boolean(search.type || search.from || search.to);
  const present = movementType.enumValues.filter((type) => history.totals[type] !== undefined);

  return (
    <>
      <PageHeader
        title={ingredient.name}
        description="Stock history: every movement, newest first, with the stock after each one."
        back={{ href: `/ingredients/${ingredient.id}`, label: "Ingredient" }}
        badge={ingredient.isActive ? null : <Badge variant="neutral">Archived</Badge>}
      />
      <div className="flex flex-col gap-6">
        <HistoryFilters ingredientId={ingredient.id} type={search.type} from={search.from} to={search.to} />
        <MetricGrid>
          <MetricCard label="In stock now" value={formatQty(stock, baseUnit)} tone={amountTone(stock)} />
          {present.map((type) => (
            <MetricCard
              key={type}
              label={MOVEMENT_TYPE_LABELS[type]}
              value={signedQty(history.totals[type]!, baseUnit)}
              tone={amountTone(history.totals[type]!)}
            />
          ))}
        </MetricGrid>
        {history.truncated ? (
          <p className="rounded-lg border border-border bg-warning px-4 py-3 text-sm text-warning-foreground">
            Showing the newest 500 movements. Narrow the dates to see older ones.
          </p>
        ) : null}
        {history.rows.length === 0 ? (
          <EmptyState
            icon={History}
            title="No movements"
            description={filtered ? "Nothing matches these filters." : "This ingredient has no stock movements yet."}
          >
            {filtered ? (
              <Link href={`/history?ingredient=${ingredient.id}`} className={buttonVariants({ variant: "outline" })}>
                Clear filters
              </Link>
            ) : null}
          </EmptyState>
        ) : (
          <Movements rows={history.rows} baseUnit={baseUnit} timeZone={membership.timezone} />
        )}
      </div>
    </>
  );
}
