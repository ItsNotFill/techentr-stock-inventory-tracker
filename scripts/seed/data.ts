import type { BaseUnit, MemberRole } from "../../lib/db/schema/enums";

// The pizzeria example from SPEC.md. Fixed ids make the seed repeatable:
// running it again updates the same rows instead of adding new ones.

export const SEED_ORGANIZATION = {
  id: "5eed0000-0000-4000-8000-000000000001",
  name: "Pizzeria Demo",
};

export const SEED_LOCATION = {
  id: "5eed0000-0000-4000-8000-000000000002",
  name: "Pizzeria Demo",
  timezone: "Europe/Amsterdam",
  posProvider: "demo",
};

export const SEED_USERS: { email: string; role: MemberRole }[] = [
  { email: "owner@pizzeria-demo.example.com", role: "owner" },
  { email: "manager@pizzeria-demo.example.com", role: "manager" },
  { email: "staff@pizzeria-demo.example.com", role: "staff" },
];

export type SeedIngredient = {
  name: string;
  baseUnit: BaseUnit;
  /** Euros for `costPer` base units: { price: "8", per: "1000" } is EUR 8 per kg. */
  cost: { price: string; per: string };
  /** In base units. */
  reorderPoint?: string;
  parLevel?: string;
  category: string;
  storageArea: string;
  /** The first pack is the default. Sizes in base units. */
  packs: { label: string; qtyInBaseUnit: string }[];
};

const perKg = (price: string) => ({ price, per: "1000" });
const perLitre = (price: string) => ({ price, per: "1000" });
const each = (price: string) => ({ price, per: "1" });

export const SEED_INGREDIENTS: SeedIngredient[] = [
  // Dairy. Mozzarella is the worked example: EUR 8 per kg, delivered in 1 kg bags.
  {
    name: "Mozzarella",
    baseUnit: "g",
    cost: perKg("8"),
    reorderPoint: "2000",
    parLevel: "8000",
    category: "Dairy",
    storageArea: "Walk-in fridge",
    packs: [
      { label: "Bag 1 kg", qtyInBaseUnit: "1000" },
      { label: "Case 10×1 kg", qtyInBaseUnit: "10000" },
    ],
  },
  {
    name: "Gorgonzola",
    baseUnit: "g",
    cost: perKg("14"),
    reorderPoint: "500",
    parLevel: "2000",
    category: "Dairy",
    storageArea: "Walk-in fridge",
    packs: [{ label: "Wedge 1.5 kg", qtyInBaseUnit: "1500" }],
  },
  {
    name: "Parmesan",
    baseUnit: "g",
    cost: perKg("18"),
    reorderPoint: "500",
    parLevel: "2000",
    category: "Dairy",
    storageArea: "Walk-in fridge",
    packs: [{ label: "Block 1 kg", qtyInBaseUnit: "1000" }],
  },
  {
    name: "Fontina",
    baseUnit: "g",
    cost: perKg("15"),
    reorderPoint: "500",
    parLevel: "2000",
    category: "Dairy",
    storageArea: "Walk-in fridge",
    packs: [{ label: "Block 1 kg", qtyInBaseUnit: "1000" }],
  },
  // Dry store
  {
    name: "Flour tipo 00",
    baseUnit: "g",
    cost: perKg("1.10"),
    reorderPoint: "25000",
    parLevel: "75000",
    category: "Dry goods",
    storageArea: "Dry store",
    packs: [{ label: "Sack 25 kg", qtyInBaseUnit: "25000" }],
  },
  {
    name: "Tomato passata",
    baseUnit: "ml",
    cost: perLitre("2.20"),
    reorderPoint: "5000",
    parLevel: "30000",
    category: "Dry goods",
    storageArea: "Dry store",
    packs: [
      { label: "Tin 2.5 L", qtyInBaseUnit: "2500" },
      { label: "Case 6×2.5 L", qtyInBaseUnit: "15000" },
    ],
  },
  {
    name: "Olive oil",
    baseUnit: "ml",
    cost: perLitre("9"),
    reorderPoint: "3000",
    parLevel: "12000",
    category: "Dry goods",
    storageArea: "Dry store",
    packs: [
      { label: "Bottle 1 L", qtyInBaseUnit: "1000" },
      { label: "Case 12×1 L", qtyInBaseUnit: "12000" },
    ],
  },
  {
    name: "Black olives",
    baseUnit: "g",
    cost: perKg("7.50"),
    reorderPoint: "1000",
    parLevel: "4000",
    category: "Dry goods",
    storageArea: "Dry store",
    packs: [{ label: "Tin 2 kg", qtyInBaseUnit: "2000" }],
  },
  // Fresh and cured
  {
    name: "Basil",
    baseUnit: "g",
    cost: perKg("25"),
    reorderPoint: "100",
    parLevel: "400",
    category: "Produce",
    storageArea: "Walk-in fridge",
    packs: [{ label: "Bunch 50 g", qtyInBaseUnit: "50" }],
  },
  {
    name: "Mushrooms",
    baseUnit: "g",
    cost: perKg("6"),
    reorderPoint: "1000",
    parLevel: "4000",
    category: "Produce",
    storageArea: "Walk-in fridge",
    packs: [{ label: "Crate 2 kg", qtyInBaseUnit: "2000" }],
  },
  {
    name: "Spicy salami",
    baseUnit: "g",
    cost: perKg("12"),
    reorderPoint: "1000",
    parLevel: "3000",
    category: "Meat",
    storageArea: "Walk-in fridge",
    packs: [{ label: "Pack 1 kg", qtyInBaseUnit: "1000" }],
  },
  {
    name: "Cooked ham",
    baseUnit: "g",
    cost: perKg("11"),
    reorderPoint: "1000",
    parLevel: "3000",
    category: "Meat",
    storageArea: "Walk-in fridge",
    packs: [{ label: "Pack 1 kg", qtyInBaseUnit: "1000" }],
  },
  // Drinks: bought by the case or bottle, sold by the can or glass.
  {
    name: "Cola 33 cl can",
    baseUnit: "unit",
    cost: each("0.60"),
    reorderPoint: "24",
    parLevel: "96",
    category: "Drinks",
    storageArea: "Bar",
    packs: [{ label: "Tray 24 cans", qtyInBaseUnit: "24" }],
  },
  {
    name: "Beer 33 cl bottle",
    baseUnit: "unit",
    cost: each("0.95"),
    reorderPoint: "24",
    parLevel: "96",
    category: "Drinks",
    storageArea: "Bar",
    packs: [{ label: "Crate 24 bottles", qtyInBaseUnit: "24" }],
  },
  {
    name: "House red wine",
    baseUnit: "ml",
    cost: perLitre("6"),
    reorderPoint: "3000",
    parLevel: "9000",
    category: "Drinks",
    storageArea: "Bar",
    packs: [
      { label: "Bottle 75 cl", qtyInBaseUnit: "750" },
      { label: "Case 6×75 cl", qtyInBaseUnit: "4500" },
    ],
  },
  // Packaging
  {
    name: "Pizza box",
    baseUnit: "unit",
    cost: each("0.25"),
    reorderPoint: "100",
    parLevel: "400",
    category: "Packaging",
    storageArea: "Dry store",
    packs: [{ label: "Bundle 100", qtyInBaseUnit: "100" }],
  },
];

/**
 * The worked example's day (SPEC.md, "mozzarella over one day"), in the
 * restaurant's own time. Every ingredient starts the day at its par level,
 * except mozzarella: opening count 2,000 g, then a delivery of 5 x 1 kg.
 * The day's sales are in scripts/seed/sample-sales-day1.csv: 30 Margherita and
 * 10 Quattro Formaggi, which leaves 2,600 g.
 */
export const SEED_DAY = {
  date: { year: 2026, month: 11, day: 16 },
  openingHour: 8,
  deliveryHour: 10,
  mozzarella: { name: "Mozzarella", openingQty: "2000", deliveryQty: "5000" },
  salesFile: "scripts/seed/sample-sales-day1.csv",
};

/** How the sample sales files are laid out (the same mapping the import screen would save). */
export const SEED_COLUMN_MAP = {
  orderId: "Order ID",
  itemName: "Item",
  itemId: null,
  quantity: "Quantity",
  soldAt: "Date",
  soldAtTime: "Time",
  dateFormat: "dmy",
  decimalSeparator: ".",
} as const;

export type SeedMenuItem = {
  /** The name exactly as the POS prints it. Stage 3's sample sales CSV uses these. */
  posName: string;
  displayName?: string;
  kind?: "item" | "modifier";
  category: string;
  price?: string;
  /** Uses no stock (service charge). No recipe. */
  ignored?: boolean;
  /** Ingredient name -> amount for one sale, in the ingredient's base unit. */
  recipe?: Record<string, string>;
};

const DOUGH = { "Flour tipo 00": "160", "Olive oil": "5" };

export const SEED_MENU: SeedMenuItem[] = [
  // Pizzas. The worked example in SPEC.md: Margherita 120 g mozzarella, Quattro Formaggi 80 g.
  {
    posName: "Margherita",
    category: "Pizza",
    price: "9.50",
    recipe: { ...DOUGH, Mozzarella: "120", "Tomato passata": "80", Basil: "2" },
  },
  {
    posName: "Marinara",
    category: "Pizza",
    price: "8.00",
    recipe: { ...DOUGH, "Tomato passata": "100" },
  },
  {
    posName: "Quattro Formaggi",
    category: "Pizza",
    price: "12.50",
    recipe: { ...DOUGH, Mozzarella: "80", Gorgonzola: "40", Fontina: "40", Parmesan: "20" },
  },
  {
    posName: "Diavola",
    category: "Pizza",
    price: "11.50",
    recipe: { ...DOUGH, Mozzarella: "100", "Tomato passata": "80", "Spicy salami": "50" },
  },
  {
    posName: "Prosciutto e Funghi",
    category: "Pizza",
    price: "12.00",
    recipe: { ...DOUGH, Mozzarella: "100", "Tomato passata": "80", "Cooked ham": "50", Mushrooms: "60" },
  },
  {
    posName: "Capricciosa",
    category: "Pizza",
    price: "12.50",
    recipe: {
      ...DOUGH,
      Mozzarella: "100",
      "Tomato passata": "80",
      "Cooked ham": "40",
      Mushrooms: "40",
      "Black olives": "25",
    },
  },
  // Modifiers are items with their own recipe.
  { posName: "Extra mozzarella", kind: "modifier", category: "Extras", price: "1.50", recipe: { Mozzarella: "50" } },
  { posName: "Extra salami", kind: "modifier", category: "Extras", price: "2.00", recipe: { "Spicy salami": "30" } },
  { posName: "Takeaway box", kind: "modifier", category: "Extras", price: "0.50", recipe: { "Pizza box": "1" } },
  // Drinks: stocked by the bottle or can, sold by the piece or the glass.
  { posName: "Cola 33cl", displayName: "Cola", category: "Drinks", price: "3.00", recipe: { "Cola 33 cl can": "1" } },
  { posName: "Beer 33cl", displayName: "Beer", category: "Drinks", price: "4.50", recipe: { "Beer 33 cl bottle": "1" } },
  {
    posName: "House red glass",
    displayName: "House red, glass",
    category: "Drinks",
    price: "5.00",
    recipe: { "House red wine": "150" },
  },
  {
    posName: "House red bottle",
    displayName: "House red, bottle",
    category: "Drinks",
    price: "22.00",
    recipe: { "House red wine": "750" },
  },
  // Uses no stock.
  { posName: "Service charge", category: "Other", ignored: true },
];
