/**
 * Cloudflare Worker: serves static assets, and for social crawlers hitting
 * /?rsn=Name injects dynamic Open Graph tags so Discord/Twitter/etc. show
 * the player's name, QP, total level, and main goal.
 */
const SUPABASE_URL = 'https://ahutsqmyahyxmrocrmwd.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodXRzcW15YWh5eG1yb2NybXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzE0MDcsImV4cCI6MjA5NjYwNzQwN30.DqawvPa6wpdHhRR4NQa_paioIUQFYXhcNyPWd7j7tto';
const SITE = 'https://journal.osrsjournal.com';
const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Discordbot|Slackbot|WhatsApp|TelegramBot|SkypeUriPreview|redditbot|Embedly|Quora Link Preview/i;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rsnIlikeFilter(rsn) {
  const escaped = String(rsn || '').trim()
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '**')
    .replace(/_/g, '\\_')
    .replace(/%/g, '\\%');
  return `rsn=ilike.${encodeURIComponent(escaped)}`;
}

async function loadPublicProfile(rsn) {
  const filter = rsnIlikeFilter(rsn);
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
  };
  const pRes = await fetch(
    `${SUPABASE_URL}/rest/v1/players?${filter}&select=rsn,quest_points,last_synced&limit=1`,
    { headers }
  );
  if (!pRes.ok) return null;
  const players = await pRes.json();
  if (!players?.[0]) return null;
  const canonical = players[0].rsn;
  const q = encodeURIComponent(canonical);
  const [sRes, gRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/player_skills?rsn=eq.${q}&select=skill,level&skill=eq.overall`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/public_main_goal`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_rsn: canonical }),
    }),
  ]);
  const skills = sRes.ok ? await sRes.json() : [];
  let mainGoal = null;
  if (gRes.ok) {
    const label = await gRes.json();
    if (typeof label === 'string' && label) mainGoal = label;
  }
  return {
    rsn: canonical,
    qp: players[0].quest_points,
    total: skills?.[0]?.level ?? null,
    mainGoal,
  };
}

function ogPage({ rsn, qp, total, mainGoal }) {
  const title = `${rsn} — OSRS Journal`;
  const parts = [];
  if (total != null) parts.push(`Total level ${total}`);
  if (qp != null) parts.push(`${qp} QP`);
  if (mainGoal) parts.push(`Working on ${mainGoal}`);
  const description =
    parts.length > 0
      ? parts.join(' · ') + ' — live-synced from RuneLite.'
      : `${rsn}'s OSRS Journal — skills, quests, and next unlocks.`;
  const url = `${SITE}/?rsn=${encodeURIComponent(rsn)}`;
  const image = `${SITE}/assets/icon.png`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="OSRS Journal">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${image}">
<meta http-equiv="refresh" content="0;url=${escapeHtml(url)}">
<link rel="canonical" href="${escapeHtml(url)}">
</head>
<body>
<p><a href="${escapeHtml(url)}">${escapeHtml(rsn)} on OSRS Journal</a></p>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const rsn = (url.searchParams.get('rsn') || '').trim();
    const ua = request.headers.get('User-Agent') || '';
    if (rsn && rsn.length <= 20 && BOT_RE.test(ua) && request.method === 'GET') {
      try {
        const profile = await loadPublicProfile(rsn);
        if (profile) {
          return new Response(ogPage(profile), {
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'public, max-age=300',
            },
          });
        }
      } catch (e) {
        console.error('og profile', e);
      }
    }

    const assetRes = await env.ASSETS.fetch(request);
    // App shell (HTML + game-data.js) must not linger on the CDN after deploys.
    const ct = assetRes.headers.get('content-type') || '';
    const path = url.pathname;
    const isAppShell =
      ct.includes('text/html') ||
      path === '/' ||
      path.endsWith('.html') ||
      path === '/index.html' ||
      path.endsWith('/game-data.js') ||
      path === '/game-data.js' ||
      path.endsWith('/osrs-redesign.css') ||
      path.endsWith('.js');
    if (isAppShell && assetRes.status === 200) {
      const headers = new Headers(assetRes.headers);
      headers.set('Cache-Control', 'no-store, max-age=0');
      return new Response(assetRes.body, {
        status: assetRes.status,
        statusText: assetRes.statusText,
        headers,
      });
    }
    return assetRes;
  },
};
