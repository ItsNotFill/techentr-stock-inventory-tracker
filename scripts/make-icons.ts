/**
 * Draws the app mark (the lucide Store icon, white, on the green primary) and
 * renders the PNGs the PWA needs, with Playwright's Chromium:
 *
 *   npx tsx scripts/make-icons.ts
 *
 * Output: public/icons/icon-192.png, icon-512.png, maskable-512.png and
 * app/apple-icon.png, app/icon.png. The PNGs are committed; run this only when
 * the mark changes.
 *
 * GREEN mirrors `--primary` in app/globals.css (a PNG cannot read a CSS variable).
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const GREEN = "#2E7D4F"; // --primary
const WHITE = "#FFFFFF"; // --primary-foreground

// The `Store` icon of lucide-react (24 x 24 grid, stroke 2), copied from
// node_modules/lucide-react/dist/esm/icons/store.mjs.
const STORE = [
  "M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5",
  "M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244",
  "M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05",
];

type Variant = {
  file: string;
  size: number;
  /** Corner radius as a share of the size: 0 is full bleed (opaque). */
  radius: number;
  /** Glyph width as a share of the size. */
  glyph: number;
};

const VARIANTS: Variant[] = [
  // "any" icons: a rounded square on a transparent background.
  { file: "public/icons/icon-192.png", size: 192, radius: 0.22, glyph: 0.56 },
  { file: "public/icons/icon-512.png", size: 512, radius: 0.22, glyph: 0.56 },
  // Maskable: full bleed; the glyph stays well inside the central 80% safe zone.
  { file: "public/icons/maskable-512.png", size: 512, radius: 0, glyph: 0.5 },
  // iOS rounds the corners itself and needs an opaque image.
  { file: "app/apple-icon.png", size: 180, radius: 0, glyph: 0.56 },
  // The browser tab icon.
  { file: "app/icon.png", size: 192, radius: 0.22, glyph: 0.56 },
];

function svg({ size, radius, glyph }: Variant): string {
  const scale = (size * glyph) / 24;
  const offset = (size - size * glyph) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="${GREEN}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${WHITE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${STORE.map((d) => `<path d="${d}"/>`).join("\n    ")}
  </g>
</svg>`;
}

async function main() {
  mkdirSync(resolve("public/icons"), { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const variant of VARIANTS) {
      const page = await browser.newPage({ viewport: { width: variant.size, height: variant.size }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg(variant)}`);
      await page.screenshot({ path: resolve(variant.file), omitBackground: true, clip: { x: 0, y: 0, width: variant.size, height: variant.size } });
      await page.close();
      console.log("wrote", variant.file);
    }
  } finally {
    await browser.close();
  }
}

void main();
