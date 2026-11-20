import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SupplierSummary } from "@/lib/purchasing";

const LINK = "text-primary hover:underline hover:underline-offset-4";

function ArchivedBadge() {
  return (
    <Badge variant="neutral" className="ml-2 align-middle">
      Archived
    </Badge>
  );
}

function Email({ value }: { value: string | null }) {
  return value ? (
    <a href={`mailto:${value}`} className={LINK}>
      {value}
    </a>
  ) : (
    <span className="text-muted-foreground">–</span>
  );
}

function Phone({ value }: { value: string | null }) {
  return value ? (
    <a href={`tel:${value.replace(/\s+/g, "")}`} className={LINK}>
      {value}
    </a>
  ) : (
    <span className="text-muted-foreground">–</span>
  );
}

export function SupplierList({ suppliers }: { suppliers: SupplierSummary[] }) {
  return (
    <>
      {/* Phone: one card per supplier. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {suppliers.map((supplier) => (
          <li key={supplier.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/suppliers/${supplier.id}`} className="font-semibold text-primary hover:underline hover:underline-offset-4">
                  {supplier.name}
                </Link>
                {supplier.isActive ? null : <ArchivedBadge />}
                {supplier.contactName ? <p className="text-sm text-muted-foreground">{supplier.contactName}</p> : null}
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm tabular-nums">
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="min-w-0 truncate text-right">
                <Email value={supplier.email} />
              </dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="text-right">
                <Phone value={supplier.phone} />
              </dd>
              <dt className="text-muted-foreground">Ingredients</dt>
              <dd className="text-right">{supplier.ingredientCount}</dd>
              <dt className="text-muted-foreground">Open orders</dt>
              <dd className="text-right">{supplier.openOrders}</dd>
            </dl>
          </li>
        ))}
      </ul>

      {/* Tablet and up: table. */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Ingredients</TableHead>
              <TableHead className="text-right">Open orders</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell>
                  <Link href={`/suppliers/${supplier.id}`} className={`block py-1 font-medium ${LINK}`}>
                    {supplier.name}
                    {supplier.isActive ? null : <ArchivedBadge />}
                  </Link>
                </TableCell>
                <TableCell>{supplier.contactName ?? <span className="text-muted-foreground">–</span>}</TableCell>
                <TableCell>
                  <Email value={supplier.email} />
                </TableCell>
                <TableCell className="tabular-nums">
                  <Phone value={supplier.phone} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{supplier.ingredientCount}</TableCell>
                <TableCell className="text-right tabular-nums">{supplier.openOrders}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
