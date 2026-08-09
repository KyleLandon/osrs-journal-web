/**
 * Copy latest web app files from the parent OSRS Journal monorepo.
 * Run from website/: npm run sync
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const copies = [
  [join(root, "osrs-journal.html"), join(here, "index.html")],
  [join(root, "privacy.html"), join(here, "privacy.html")],
  [join(root, "quest-reqs-data.json"), join(here, "quest-reqs-data.json")],
  [join(root, "game-data.js"), join(here, "game-data.js")],
  [join(root, "quest-guide-data.js"), join(here, "quest-guide-data.js")],
  [join(root, "features.css"), join(here, "features.css")],
  [join(root, "features-progress.js"), join(here, "features-progress.js")],
  [join(root, "features-calc.js"), join(here, "features-calc.js")],
  [join(root, "features-guide.js"), join(here, "features-guide.js")],
  [join(root, "features-upgrades.js"), join(here, "features-upgrades.js")],
  [join(root, "features-timers.js"), join(here, "features-timers.js")],
  [join(root, "features-clog.js"), join(here, "features-clog.js")],
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
    // Skip Figma Make prototype (large; not part of the live site).
    if (name === "Redesign OSRS Journal UI") continue;
    cpSync(join(assetsSrc, name), join(assetsDest, name), { recursive: true });
  }
  console.log("Copied assets/");
} else {
  console.warn("No assets/ in monorepo — add logo-nav.png and favicon-32.png");
}

console.log("Sync complete. Commit and push to deploy.");
