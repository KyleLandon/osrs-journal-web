/**
 * Copy latest web app files from the parent OSRS Import monorepo.
 * Run from website/: npm run sync
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const copies = [
  [join(root, "osrs-journal.html"), join(here, "index.html")],
  [join(root, "quest-reqs-data.json"), join(here, "quest-reqs-data.json")],
];

for (const [src, dest] of copies) {
  if (!existsSync(src)) {
    console.error("Missing:", src);
    process.exit(1);
  }
  copyFileSync(src, dest);
  console.log("Copied", dest);
}

const assetsSrc = join(root, "assets");
const assetsDest = join(here, "assets");
if (existsSync(assetsSrc)) {
  mkdirSync(assetsDest, { recursive: true });
  for (const name of readdirSync(assetsSrc)) {
    cpSync(join(assetsSrc, name), join(assetsDest, name), { recursive: true });
  }
  console.log("Copied assets/");
} else {
  console.warn("No assets/ in monorepo — add logo-nav.png and favicon-32.png");
}

console.log("Sync complete. Commit and push to deploy.");
