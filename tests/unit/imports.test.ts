import { describe, expect, it } from "vitest";
import { CsvError, parseCsv } from "@/lib/imports/csv";
import { guessColumnMap, guessDateFormat, guessDecimalSeparator, mapFitsHeaders } from "@/lib/imports/mapping";
import { parseCsvDate, parseCsvQuantity, prepareImport } from "@/lib/imports/rows";
import { localDateOf, zonedTimeToUtc } from "@/lib/imports/time";
import { columnMapSchema, type ColumnMap } from "@/lib/validation/imports";

const AMSTERDAM = "Europe/Amsterdam";

describe("timezones", () => {
  it("converts local restaurant time to UTC, in winter and in summer", () => {
    const at = (month: number, day: number, hour: number) =>
      zonedTimeToUtc({ year: 2026, month, day, hour, minute: 30, second: 0 }, AMSTERDAM).toISOString();
    expect(at(11, 16, 19)).toBe("2026-11-16T18:30:00.000Z"); // UTC+1
    expect(at(7, 16, 19)).toBe("2026-07-16T17:30:00.000Z"); // UTC+2
    expect(zonedTimeToUtc({ year: 2026, month: 11, day: 16, hour: 19, minute: 30, second: 0 }, "America/New_York").toISOString()).toBe(
      "2026-11-17T00:30:00.000Z",
    );
    expect(zonedTimeToUtc({ year: 2026, month: 11, day: 16, hour: 19, minute: 30, second: 0 }, "UTC").toISOString()).toBe(
      "2026-11-16T19:30:00.000Z",
    );
  });

  it("handles the clock changes", () => {
    // 29 March 2026: 02:00 jumps to 03:00 in Amsterdam. 02:30 does not exist and moves forward.
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 }, AMSTERDAM).toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 3, minute: 30, second: 0 }, AMSTERDAM).toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 1, minute: 30, second: 0 }, AMSTERDAM).toISOString()).toBe(
      "2026-03-29T00:30:00.000Z",
    );
    // 25 October 2026: 02:30 happens twice; the result is one of the two real instants.
    const twice = zonedTimeToUtc({ year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 }, AMSTERDAM).toISOString();
    expect(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]).toContain(twice);
  });

  it("gives the local calendar date of an instant", () => {
    expect(localDateOf(new Date("2026-11-16T23:30:00Z"), AMSTERDAM)).toBe("2026-11-17");
    expect(localDateOf(new Date("2026-11-16T22:30:00Z"), AMSTERDAM)).toBe("2026-11-16");
  });
});

describe("reading dates from a CSV", () => {
  const iso = (value: string, time: string | null, format: Parameters<typeof parseCsvDate>[2]) =>
    parseCsvDate(value, time, format, AMSTERDAM)?.toISOString() ?? null;

  it("reads the common formats as local time", () => {
    expect(iso("2026-11-16 19:30", null, "iso")).toBe("2026-11-16T18:30:00.000Z");
    expect(iso("2026-11-16T19:30:15", null, "iso")).toBe("2026-11-16T18:30:15.000Z");
    expect(iso("16/11/2026 19:30", null, "dmy")).toBe("2026-11-16T18:30:00.000Z");
    expect(iso("16-11-2026 19:30:00", null, "dmy")).toBe("2026-11-16T18:30:00.000Z");
    expect(iso("16.11.26 19:30", null, "dmy")).toBe("2026-11-16T18:30:00.000Z");
    expect(iso("11/16/2026 7:30 PM", null, "mdy")).toBe("2026-11-16T18:30:00.000Z");
    expect(iso("11/16/2026 12:05 AM", null, "mdy")).toBe("2026-11-15T23:05:00.000Z");
    expect(iso("2026/11/16 19:30", null, "ymd")).toBe("2026-11-16T18:30:00.000Z");
  });

  it("uses a separate time column when there is one", () => {
    expect(iso("16/11/2026", "19:30", "dmy")).toBe("2026-11-16T18:30:00.000Z");
    expect(iso("16/11/2026", "7:30 pm", "dmy")).toBe("2026-11-16T18:30:00.000Z");
    expect(iso("16/11/2026", "", "dmy")).toBe("2026-11-16T11:00:00.000Z");
  });

  it("puts a sale without a time at noon local time", () => {
    expect(iso("16/11/2026", null, "dmy")).toBe("2026-11-16T11:00:00.000Z");
    expect(iso("2026-07-16", null, "iso")).toBe("2026-07-16T10:00:00.000Z");
  });

  it("respects an offset written in the file", () => {
    expect(iso("2026-11-16T19:30:00Z", null, "iso")).toBe("2026-11-16T19:30:00.000Z");
    expect(iso("2026-11-16T19:30:00+02:00", null, "iso")).toBe("2026-11-16T17:30:00.000Z");
    expect(iso("2026-11-16 19:30:00-0500", null, "iso")).toBe("2026-11-17T00:30:00.000Z");
  });

  it("refuses what is not a date", () => {
    for (const [value, time, format] of [
      ["31/02/2026", null, "dmy"],
      ["16/13/2026", null, "dmy"],
      ["2026-11-16", null, "dmy"],
      ["16/11/2026 25:00", null, "dmy"],
      ["16/11/2026", "nope", "dmy"],
      ["yesterday", null, "iso"],
      ["", null, "iso"],
      ["11/16/2026 13:30 PM", null, "mdy"],
    ] as const) {
      expect(iso(value, time, format), `${value} ${time ?? ""}`).toBeNull();
    }
  });
});

describe("reading quantities from a CSV", () => {
  it("reads both decimal styles and refunds", () => {
    expect(parseCsvQuantity("2", ".")?.toString()).toBe("2");
    expect(parseCsvQuantity("1.5", ".")?.toString()).toBe("1.5");
    expect(parseCsvQuantity("1,5", ",")?.toString()).toBe("1.5");
    expect(parseCsvQuantity("1.234,5", ",")?.toString()).toBe("1234.5");
    expect(parseCsvQuantity("1,234.5", ".")?.toString()).toBe("1234.5");
    expect(parseCsvQuantity("-1", ".")?.toString()).toBe("-1");
    expect(parseCsvQuantity(" 3 ", ".")?.toString()).toBe("3");
  });

  it("returns null for anything that is not a number", () => {
    for (const value of ["", "two", "1e3", "1.2.3", "--1", "2x"]) {
      expect(parseCsvQuantity(value, "."), value).toBeNull();
    }
  });
});

describe("parsing the file", () => {
  it("detects the delimiter, trims headers and keeps values as text", () => {
    const comma = parseCsv("Order ID, Item ,Qty\n1001,Margherita,2\n\n1002,Cola,1\n");
    expect(comma.headers).toEqual(["Order ID", "Item", "Qty"]);
    expect(comma.rows).toEqual([
      { "Order ID": "1001", Item: "Margherita", Qty: "2" },
      { "Order ID": "1002", Item: "Cola", Qty: "1" },
    ]);
    const semicolon = parseCsv("﻿Bon;Artikel;Aantal\n1001;Margherita;1,5\n");
    expect(semicolon.delimiter).toBe(";");
    expect(semicolon.rows[0]).toEqual({ Bon: "1001", Artikel: "Margherita", Aantal: "1,5" });
    const quoted = parseCsv('Order,Item,Qty\n1,"Pizza, large",1\n');
    expect(quoted.rows[0].Item).toBe("Pizza, large");
    // Two columns with the same name: the later one is renamed, nothing is lost.
    const twins = parseCsv("Order,Item,Item\n1,a,b\n");
    expect(twins.headers).toEqual(["Order", "Item", "Item_1"]);
    expect(twins.rows[0]).toEqual({ Order: "1", Item: "a", Item_1: "b" });
  });

  it("explains what is wrong with an unusable file", () => {
    expect(() => parseCsv("")).toThrow(CsvError);
    expect(() => parseCsv("   \n ")).toThrow("empty");
    expect(() => parseCsv("just one column\nvalue\n")).toThrow("does not look like a table");
    expect(() => parseCsv("Order,Item,Qty\n")).toThrow("no rows");
  });
});

describe("guessing the columns", () => {
  it("recognises common POS headers", () => {
    const english = parseCsv("Order ID,Date,Time,Item,Quantity\n1001,16/11/2026,19:30,Margherita,2\n");
    expect(guessColumnMap(english)).toEqual({
      orderId: "Order ID",
      itemName: "Item",
      itemId: null,
      quantity: "Quantity",
      soldAt: "Date",
      soldAtTime: "Time",
      dateFormat: "dmy",
      decimalSeparator: ".",
    });
    const dutch = parseCsv("Bonnummer;Datum;Artikelnummer;Omschrijving;Aantal\n1001;2026-11-16 19:30;55;Margherita;1,5\n");
    expect(guessColumnMap(dutch)).toMatchObject({
      orderId: "Bonnummer",
      itemId: "Artikelnummer",
      itemName: "Omschrijving",
      quantity: "Aantal",
      soldAt: "Datum",
      soldAtTime: null,
      dateFormat: "iso",
      decimalSeparator: ",",
    });
    const receipt = parseCsv("Receipt,Created at,SKU,Product name,Qty\n1,11/16/2026 7:30 PM,A1,Margherita,1\n");
    expect(guessColumnMap(receipt)).toMatchObject({
      orderId: "Receipt",
      itemId: "SKU",
      itemName: "Product name",
      quantity: "Qty",
      soldAt: "Created at",
      dateFormat: "mdy",
    });
  });

  it("leaves a field empty rather than guess wrongly", () => {
    const odd = parseCsv("A,B,C\n1,2,3\n");
    const guess = guessColumnMap(odd);
    expect(guess.orderId).toBeUndefined();
    expect(columnMapSchema.safeParse(guess).success).toBe(false);
  });

  it("reads the date format and decimal style off the values", () => {
    expect(guessDateFormat(["03/04/2026", "16/11/2026"])).toBe("dmy");
    expect(guessDateFormat(["03/04/2026", "11/16/2026"])).toBe("mdy");
    expect(guessDateFormat(["2026-11-16"])).toBe("iso");
    expect(guessDateFormat(["2026/11/16"])).toBe("ymd");
    expect(guessDateFormat(["03/04/2026"])).toBe("dmy"); // ambiguous: day first
    expect(guessDecimalSeparator(["1", "2", "1,5"])).toBe(",");
    expect(guessDecimalSeparator(["1", "2.5"])).toBe(".");
    expect(guessDecimalSeparator(["1", "2"])).toBe(".");
  });

  it("knows when a saved mapping no longer fits a file", () => {
    const map = columnMapSchema.parse({
      orderId: "Order ID",
      itemName: "Item",
      itemId: null,
      quantity: "Quantity",
      soldAt: "Date",
      soldAtTime: "Time",
      dateFormat: "dmy",
      decimalSeparator: ".",
    });
    expect(mapFitsHeaders(map, ["Order ID", "Date", "Time", "Item", "Quantity", "Extra"])).toBe(true);
    expect(mapFitsHeaders(map, ["Order ID", "Date", "Item", "Quantity"])).toBe(false);
  });
});

describe("validating rows and building orders", () => {
  const map: ColumnMap = {
    orderId: "Order ID",
    itemName: "Item",
    itemId: null,
    quantity: "Quantity",
    soldAt: "Date",
    soldAtTime: "Time",
    dateFormat: "dmy",
    decimalSeparator: ".",
  };

  it("groups rows into orders, with the earliest time as the order's time", () => {
    const csv = parseCsv(
      [
        "Order ID,Date,Time,Item,Quantity",
        "1001,16/11/2026,12:35,Margherita,2",
        "1001,16/11/2026,12:30,Cola 33cl,2",
        "1002,16/11/2026,19:30,Quattro Formaggi,1",
        "1001,16/11/2026,12:40,Margherita,1",
      ].join("\n"),
    );
    const prepared = prepareImport(csv, map, AMSTERDAM);
    expect(prepared.totalRows).toBe(4);
    expect(prepared.invalidRows).toEqual([]);
    expect(prepared.orders.map((order) => [order.posOrderId, order.soldAt.toISOString(), order.lines.length])).toEqual([
      ["1001", "2026-11-16T11:30:00.000Z", 3],
      ["1002", "2026-11-16T18:30:00.000Z", 1],
    ]);
    expect(prepared.orders[0].lines.map((line) => [line.rowNumber, line.itemName, line.qty])).toEqual([
      [2, "Margherita", "2.000"],
      [3, "Cola 33cl", "2.000"],
      [5, "Margherita", "1.000"],
    ]);
  });

  it("reports bad rows with their line number and holds back their whole order", () => {
    const csv = parseCsv(
      [
        "Order ID,Date,Time,Item,Quantity",
        "1001,16/11/2026,12:30,Margherita,2",
        "1002,16/11/2026,12:31,Margherita,two",
        "1002,16/11/2026,12:31,Cola 33cl,1",
        "1003,31/02/2026,12:32,Margherita,1",
        ",16/11/2026,12:33,Margherita,1",
        "1004,16/11/2026,12:34,,0",
        "1005,16/11/2026,12:35,Refund Margherita,-1",
      ].join("\n"),
    );
    const prepared = prepareImport(csv, map, AMSTERDAM);
    expect(prepared.invalidRows).toEqual([
      { rowNumber: 3, orderId: "1002", itemName: "Margherita", errors: ['"two" is not a number.'] },
      { rowNumber: 5, orderId: "1003", itemName: "Margherita", errors: ['"31/02/2026 12:32" is not a date in the chosen format.'] },
      { rowNumber: 6, orderId: null, itemName: "Margherita", errors: ["The order number is missing."] },
      { rowNumber: 7, orderId: "1004", itemName: null, errors: ["The item name is missing.", "The quantity is zero."] },
    ]);
    expect(prepared.blockedOrderIds.sort()).toEqual(["1002", "1003", "1004"]);
    // 1002's good row is held back with its bad one; the refund comes through.
    expect(prepared.orders.map((order) => order.posOrderId)).toEqual(["1001", "1005"]);
    expect(prepared.orders[1].lines[0].qty).toBe("-1.000");
  });

  it("reads item ids and decimal commas when the mapping says so", () => {
    const csv = parseCsv("Bon;Datum;PLU;Artikel;Aantal\n77;2026-11-16 19:30;55;Margherita;1,5\n78;2026-11-16 19:31;;Cola;1\n");
    const prepared = prepareImport(
      csv,
      { orderId: "Bon", itemName: "Artikel", itemId: "PLU", quantity: "Aantal", soldAt: "Datum", soldAtTime: null, dateFormat: "iso", decimalSeparator: "," },
      AMSTERDAM,
    );
    expect(prepared.invalidRows).toEqual([]);
    expect(prepared.orders.map((order) => [order.lines[0].itemId, order.lines[0].qty])).toEqual([
      ["55", "1.500"],
      [null, "1.000"],
    ]);
  });
});
