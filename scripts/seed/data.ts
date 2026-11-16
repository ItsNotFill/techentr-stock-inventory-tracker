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
