/**
 * Cloudflare Pages build — writes supabase-config.json from env vars when set,
 * otherwise keeps the committed supabase-config.json in the repo.
 * Also stamps version.build.json (gitignored) with the deploy git SHA.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

function gitSha() {
  const fromCf = (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || "").trim();
  if (fromCf) return fromCf.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

function writeVersionStamp() {
  let version = "1.1.0";
  try {
    version = JSON.parse(readFileSync("package.json", "utf8")).version || version;
  } catch {
    /* keep fallback */
  }
  const stamp = {
    version,
    commit: gitSha(),
    builtAt: new Date().toISOString(),
  };
  writeFileSync("version.build.json", JSON.stringify(stamp, null, 2) + "\n");
  console.log("Stamped", stamp.version, stamp.commit);
}

writeVersionStamp();

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "API_BASE_URL"];
const missing = required.filter((k) => !process.env[k]?.trim());

if (missing.length) {
  if (existsSync("supabase-config.json")) {
    console.log(
      "No Cloudflare env vars set — using committed supabase-config.json",
    );
    process.exit(0);
  }
  console.error("Missing env vars and no supabase-config.json:", missing.join(", "));
  process.exit(1);
}

const config = {
  url: process.env.SUPABASE_URL.trim(),
  anonKey: process.env.SUPABASE_ANON_KEY.trim(),
  apiBaseUrl: process.env.API_BASE_URL.trim().replace(/\/$/, ""),
  webAppUrl: (process.env.WEB_APP_URL || "https://journal.osrsjournal.com")
    .trim()
    .replace(/\/$/, ""),
  hostedMode: true,
};

writeFileSync("supabase-config.json", JSON.stringify(config, null, 2) + "\n");
console.log("Wrote supabase-config.json from env for", config.webAppUrl);
