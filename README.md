# OSRS Journal — Web

Static web app for [journal.osrsjournal.com](https://journal.osrsjournal.com).

Players sign in, link characters via the RuneLite plugin pairing code, view stats/quests/gear, and search public profiles (Wise Old Man style).

The [RuneLite plugin](https://github.com/YOUR_USER/osrs-journal-plugin) lives in a separate repo.

---

## Deploy with Cloudflare Pages (GitHub)

### 1. Create the GitHub repo

```bash
cd website
git init
git add .
git commit -m "Initial OSRS Journal web app"
```

**Live repo:** https://github.com/KyleLandon/osrs-journal-web

To push updates after syncing from the monorepo:

```bash
git push
```

### 2. Connect Cloudflare Pages

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select `osrs-journal-web`
3. Build settings:

**Option A — Cloudflare Pages (recommended)**

| Setting | Value |
|---------|--------|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `/` |
| Deploy command | *(leave empty — Pages uploads files automatically)* |

**Workers Builds (deploy command required)**

| Setting | Value |
|---------|--------|
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |

`worker.js` + `wrangler.toml` serve all static files (`index.html`,
`supabase-config.json`, `quest-reqs-data.json`, `assets/`).

The Worker **name** in `wrangler.toml` (`osrsjournal`) must match your
Cloudflare Worker / Workers Builds project name.

### 3. Environment variables (Production)

**Pages → your project → Settings → Environment variables:**

| Variable | Example |
|----------|---------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | your public anon key |
| `API_BASE_URL` | `https://xxxx.supabase.co/functions/v1` |
| `WEB_APP_URL` | `https://journal.osrsjournal.com` |

`supabase-config.json` is committed (anon key is public; RLS protects data). If Cloudflare
env vars are set, the build step overwrites it — otherwise the committed file is used.

### 4. Custom domain

**Pages → Custom domains** → add `journal.osrsjournal.com`

(DNS is automatic when `osrsjournal.com` is on Cloudflare.)

### 5. Supabase auth URLs

See the monorepo `supabase/AUTH_SETUP.md` — Site URL must match `WEB_APP_URL`.

---

## Local development

```bash
# Generate config from example (edit values first)
cp supabase-config.example.json supabase-config.json

# Serve locally (requires HTTP, not file://)
npx serve .
# open http://localhost:3000
```

---

## Sync from monorepo

When you edit `osrs-journal.html` in the parent **OSRS Import** project:

```bash
cd website
npm run sync
git add -A
git commit -m "Sync web app from monorepo"
git push
```

Cloudflare redeploys automatically on push.

---

## Repository layout

```
index.html              Main app
quest-reqs-data.json    Quest requirements (blocked-quest checks)
assets/                 logo-nav.png, favicon-32.png
build.mjs               Cloudflare build — writes supabase-config.json
sync-from-monorepo.mjs  Pull latest HTML/JSON from parent repo
```
