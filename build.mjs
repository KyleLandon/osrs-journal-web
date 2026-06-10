/**
 * Cloudflare Pages build step — writes supabase-config.json from env vars.
 * Set these in Cloudflare Pages → Settings → Environment variables.
 */
import { writeFileSync } from "node:fs";

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "API_BASE_URL"];

const missing = required.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(
    "Missing environment variables for build:",
    missing.join(", "),
  );
  console.error(
    "Set them in Cloudflare Pages → Settings → Environment variables (Production).",
  );
  process.exit(1);
}

const config = {
  url: process.env.SUPABASE_URL.trim(),
  anonKey: process.env.SUPABASE_ANON_KEY.trim(),
  apiBaseUrl: process.env.API_BASE_URL.trim().replace(/\/$/, ""),
  webAppUrl: (process.env.WEB_APP_URL || "https://journal.osrsjournal.com").trim().replace(/\/$/, ""),
  hostedMode: true,
};

writeFileSync("supabase-config.json", JSON.stringify(config, null, 2) + "\n");
console.log("Wrote supabase-config.json for", config.webAppUrl);
