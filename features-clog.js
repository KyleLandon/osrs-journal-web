/**
 * Collection Log viewer — reads player_collection_log from Supabase.
 */
(function () {
  'use strict';

  let clogRows = null; // [{page, item_id, item_name, quantity}]
  let clogFilter = '';
  let clogPageFilter = 'all';

  async function fetchCollectionLog(rsn) {
    clogRows = null;
    if (!isSupabaseConfigured() || !rsn) return;
    try {
      const headers = (HOSTED_MODE && viewingOwnCharacter) ? await getAuthHeaders() : SB_HEADERS;
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/player_collection_log?rsn=eq.${encodeURIComponent(rsn)}` +
          `&select=page,item_id,item_name,quantity&order=page.asc`,
        { headers }
      );
      if (!res.ok) return;
      clogRows = await res.json();
    } catch (_) {
      clogRows = [];
    }
  }

  window.loadCollectionLog = async function (rsn) {
    await fetchCollectionLog(rsn);
    if (currentAppTab === 'collection') renderCollectionLog();
  };

  window.setClogPage = function (page, btn) {
    clogPageFilter = page || 'all';
    document.querySelectorAll('#clogPageBtns .filter-btn').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderCollectionLog();
  };

  window.renderCollectionLog = function renderCollectionLog() {
    const root = document.getElementById('clogRoot');
    if (!root) return;

    if (!playerSkills?.attack) {
      root.innerHTML = '<div class="hint">Sync a character to view collection log progress.</div>';
      return;
    }

    if (clogRows == null) {
      root.innerHTML = '<div class="hint">Loading collection log…</div>';
      fetchCollectionLog(playerRSN).then(() => renderCollectionLog());
      return;
    }

    if (!clogRows.length) {
      root.innerHTML = `
        <div class="goal-intro">
          <h2>Collection Log</h2>
          <p>Open your Collection Log in-game with the OSRS Journal plugin running and click through pages — obtained items sync automatically.</p>
        </div>
        <div class="hint">No pages synced yet. Open the Collection Log in RuneLite and browse a few tabs.</div>`;
      return;
    }

    const byPage = {};
    for (const r of clogRows) {
      if (!byPage[r.page]) byPage[r.page] = [];
      byPage[r.page].push(r);
    }
    const pages = Object.keys(byPage).sort();
    const totalItems = clogRows.length;
    const q = (clogFilter || '').toLowerCase();

    let shownPages = pages;
    if (clogPageFilter !== 'all') shownPages = pages.filter((p) => p === clogPageFilter);

    const pageBlocks = shownPages.map((page) => {
      let items = byPage[page];
      if (q) items = items.filter((i) => (i.item_name || '').toLowerCase().includes(q) || String(i.item_id).includes(q));
      if (q && !items.length) return '';
      const icons = items.map((i) => {
        const src = typeof ITEM_ICON_CDN !== 'undefined'
          ? `${ITEM_ICON_CDN}/${i.item_id}.png`
          : `https://static.runelite.net/cache/item/icon/${i.item_id}.png`;
        return `<div class="clog-item" title="${(i.item_name || i.item_id)}${i.quantity > 1 ? ' ×' + i.quantity : ''}">
          <img src="${src}" alt="" width="32" height="32" loading="lazy">
          ${i.quantity > 1 ? `<span class="clog-qty">${i.quantity}</span>` : ''}
        </div>`;
      }).join('');
      return `
        <section class="clog-page">
          <div class="clog-page-head">
            <strong>${page}</strong>
            <span class="muted">${byPage[page].length} obtained</span>
          </div>
          <div class="clog-items">${icons || '<span class="hint">No matches</span>'}</div>
        </section>`;
    }).join('');

    root.innerHTML = `
      <div class="goal-intro">
        <h2>Collection Log</h2>
        <p>Synced from RuneLite when you open Collection Log pages. Counts below are <em>obtained uniques per visited page</em> — browse every page in-game for a full picture.</p>
      </div>
      <div class="progress-stat-row">
        <div class="progress-stat"><div class="num">${totalItems}</div><div class="lbl">Items logged</div></div>
        <div class="progress-stat"><div class="num">${pages.length}</div><div class="lbl">Pages visited</div></div>
      </div>
      <div class="clog-toolbar">
        <input type="search" class="quest-search" placeholder="Filter items…" value="${clogFilter.replace(/"/g, '&quot;')}"
          oninput="clogFilter=this.value;renderCollectionLog()">
        <div id="clogPageBtns" class="quest-filter">
          <button type="button" class="filter-btn${clogPageFilter === 'all' ? ' active' : ''}" onclick="setClogPage('all',this)">All pages</button>
          ${pages.slice(0, 12).map((p) =>
            `<button type="button" class="filter-btn${clogPageFilter === p ? ' active' : ''}" onclick="setClogPage('${p.replace(/'/g, "\\'")}',this)">${p}</button>`
          ).join('')}
        </div>
      </div>
      <div class="clog-pages">${pageBlocks || '<p class="hint">No matching items.</p>'}</div>
    `;
  };

  // expose filter var for inline handler
  Object.defineProperty(window, 'clogFilter', {
    get() { return clogFilter; },
    set(v) { clogFilter = v; },
  });
})();
