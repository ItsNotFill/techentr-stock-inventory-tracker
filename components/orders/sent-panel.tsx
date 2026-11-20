"use client";

import { useState } from "react";
import { cancelOrderAction } from "@/app/(app)/orders/actions";
import { ConfirmAction } from "@/components/orders/confirm-action";
import { OrderText } from "@/components/orders/order-text";
import { ReceiveForm } from "@/components/orders/receive-form";
import type { EntryValue } from "@/components/stock-entry/entry";
import { Button } from "@/components/ui/button";
import type { EntryOption } from "@/lib/ingredients";

/** A sent order: the text again, "Receive delivery" (opens the prefilled delivery form) and "Cancel order". */
export function SentPanel({
  orderId,
  options,
  receiveLines,
  initialDeliveredAt,
  text,
  supplierEmail,
  restaurantName,
}: {
  orderId: string;
  options: EntryOption[];
  receiveLines: EntryValue[];
  initialDeliveredAt: string;
  text: string;
  supplierEmail: string | null;
  restaurantName: string;
}) {
  const [receiving, setReceiving] = useState(false);
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      {receiving ? (
        <ReceiveForm
          orderId={orderId}
          options={options}
          initialLines={receiveLines}
          initialDeliveredAt={initialDeliveredAt}
          onCancel={() => setReceiving(false)}
        />
      ) : (
        <div>
          <Button type="button" size="lg" onClick={() => setReceiving(true)}>
            Receive delivery
          </Button>
        </div>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">The order text</h2>
        <OrderText text={text} email={supplierEmail} restaurantName={restaurantName} />
      </section>
      <div>
        <ConfirmAction
          label="Cancel order"
          title="Cancel this order?"
          description="The order is kept in the list as cancelled. If the goods arrive anyway, log them on the Log delivery screen."
          confirmLabel="Cancel order"
          pendingLabel="Cancelling…"
          action={() => cancelOrderAction(orderId)}
        />
      </div>
    </div>
  );
}
