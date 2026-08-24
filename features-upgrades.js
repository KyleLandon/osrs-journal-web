/**
 * Gear upgrade advisor — per-slot next upgrade from GEAR ladders + owned items.
 *
 * Ranking is by style power (not array order). Unrecognized worn items (quest
 * outfits, wrong-style weapons) count as 0 power so the best owned piece in
 * that slot is suggested instead of the first bronze row.
 */
(function () {
  'use strict';

  let upgradeStyle = 'melee';
  const EMPTY_NAMES = new Set(['none', 'unarmed', '']);
  const SLAYER_HELM_RE = /^(black|green|red|purple|turquoise|hyd|twisted|tzkal|vampyric|araxyte)\s+slayer helmet/;

  function skillLevel(sk) {
    return playerSkills?.[sk]?.level || 1;
  }

  function questDone(name) {
    if (!name) return true;
    if (typeof qd === 'function') return qd(name);
    return typeof questsDone !== 'undefined' && questsDone.has(name);
  }

  function reqMet(req) {
    if (!req) return true;
    if (req.startsWith('diary:')) {
      const parts = req.split(':');
      const region = parts[1];
      const tier = parts[2];
      if (typeof diaryComplete !== 'function' || !playerDiaries?.length) return true;
      return diaryComplete(region, tier);
    }
    if (req === 'pest') {
      const cmb = typeof getCombatLevel === 'function' ? getCombatLevel() : 40;
      return cmb >= 40;
    }
    if (req.startsWith('rfd:')) {
      if (questDone('Recipe for Disaster - Culinaromancer') || questDone('Recipe for Disaster')) {
        return true;
      }
      const map = {
        mithril: 'Recipe for Disaster - Mountain Dwarf',
        adamant: 'Recipe for Disaster - Wartface & Bentnoze',
        rune: 'Recipe for Disaster - Pirate Pete',
        dragon: 'Recipe for Disaster - Sir Amik Varze',
        barrows: 'Recipe for Disaster - Culinaromancer',
      };
      return questDone(map[req.slice(4)] || '');
    }
    return questDone(req);
  }

  function canonicalName(name) {
    let s = String(name || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").trim();
    s = s.replace(/\s*\((?:or|\d+|uncharged|charged|broken|empty|off|on|lit|beta|inactive|active|new|full|degraded|l|t|a|c|e)\)/g, '');
    // Barrows / degrading gear: "Ahrim's hood 75", "Dharok's platebody 0"
    s = s.replace(/\s+(100|75|50|25|0)$/g, '');
    s = s.replace(/\s+\d+\/\d+$/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    if (SLAYER_HELM_RE.test(s)) {
      s = 'slayer helmet' + (/\(i\)/.test(String(name).toLowerCase()) ? ' (i)' : '');
    }
    if (typeof GEAR_NAME_ALIASES !== 'undefined' && GEAR_NAME_ALIASES[s]) {
      return GEAR_NAME_ALIASES[s];
    }
    return s;
  }

  function namesMatch(a, b) {
    if (!a || !b) return false;
    return canonicalName(a) === canonicalName(b);
  }

  function isEmptyName(name) {
    return EMPTY_NAMES.has(canonicalName(name));
  }

  function power(row, style) {
    const stab = row[1] || 0;
    const slash = row[2] || 0;
    const crush = row[3] || 0;
    const magic = row[4] || 0;
    const range = row[5] || 0;
    const mStr = row[6] || 0;
    const rStr = row[7] || 0;
    const mDmg = row[8] || 0;
    const def = (row[9] || 0) + (row[10] || 0) + (row[11] || 0);
    if (style === 'ranged') return rStr * 8 + range + def * 0.02;
    if (style === 'magic') return mDmg * 20 + magic + def * 0.02;
    return mStr * 12 + Math.max(stab, slash, crush) + def * 0.03;
  }

  function canWear(row) {
    const defReq = row[13] || 1;
    const atkReq = row[14] || 1;
    const rngReq = row[15] || 1;
    const magReq = row[16] || 1;
    const questReq = row[17] || '';
    const slayerReq = row[18] || 0;
    if (skillLevel('defence') < defReq) return false;
    if (skillLevel('attack') < atkReq) return false;
    if (skillLevel('ranged') < rngReq) return false;
    if (skillLevel('magic') < magReq) return false;
    if (slayerReq && skillLevel('slayer') < slayerReq) return false;
    if (!reqMet(questReq)) return false;
    return true;
  }

  function missingReqs(row) {
    const missing = [];
    if (skillLevel('defence') < (row[13] || 1)) missing.push(`Def ${skillLevel('defence')}/${row[13]}`);
    if (skillLevel('attack') < (row[14] || 1)) missing.push(`Atk ${skillLevel('attack')}/${row[14]}`);
    if (skillLevel('ranged') < (row[15] || 1)) missing.push(`Range ${skillLevel('ranged')}/${row[15]}`);
    if (skillLevel('magic') < (row[16] || 1)) missing.push(`Mage ${skillLevel('magic')}/${row[16]}`);
    if ((row[18] || 0) && skillLevel('slayer') < row[18]) missing.push(`Slayer ${skillLevel('slayer')}/${row[18]}`);
    const req = row[17] || '';
    if (req && !reqMet(req)) {
      missing.push(req.replace(/^rfd:/, 'RFD ').replace(/^diary:/, '').replace(/:/g, ' '));
    }
    return missing;
  }

  function slotLabel(slot) {
    if (typeof SLOT_LABELS !== 'undefined' && SLOT_LABELS[slot]) return SLOT_LABELS[slot];
    return slot.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function wornInSlot(slot) {
    const want = (typeof canonicalEquipSlot === 'function') ? canonicalEquipSlot(slot) : slot;
    if (wornGear && wornGear[want]) return wornGear[want];
    const aliases = {
      head: ['head', 'helm', 'hat'],
      cape: ['cape', 'back'],
      neck: ['neck', 'amulet'],
      ammo: ['ammo', 'ammunition'],
      weapon: ['weapon'],
      body: ['body', 'torso'],
      shield: ['shield', 'offhand'],
      legs: ['legs'],
      gloves: ['gloves', 'hands'],
      boots: ['boots', 'feet'],
      ring: ['ring'],
    };
    const keys = aliases[want] || aliases[slot] || [slot];
    for (const k of Object.keys(wornGear || {})) {
      const lk = k.toLowerCase();
      if (keys.some((a) => lk === a)) return wornGear[k];
    }
    return null;
  }

  function ownedEntries() {
    const out = [];
    for (const [slot, n] of Object.entries(wornGear || {})) {
      if (n) out.push({ name: n, where: 'worn', slot });
    }
    for (const row of playerInventory || []) {
      if (row.item_name) out.push({ name: row.item_name, where: 'inventory', id: row.item_id });
    }
    for (const row of playerBank || []) {
      if (row.item_name) out.push({ name: row.item_name, where: 'bank', id: row.item_id });
    }
    for (const row of typeof playerStashes !== 'undefined' ? playerStashes : []) {
      if (!row.item_name) continue;
      const where = row.container === 'looting_bag' ? 'looting_bag' : 'poh';
      out.push({ name: row.item_name, where, id: row.item_id });
    }
    return out;
  }

  function findOwned(ladderName, entries) {
    return entries.filter((e) => namesMatch(e.name, ladderName));
  }

  function locationLabel(hits) {
    if (hits.some((h) => h.where === 'inventory')) return 'In your inventory — equip it';
    if (hits.some((h) => h.where === 'looting_bag')) return 'In your looting bag';
    if (hits.some((h) => h.where === 'poh')) return 'In your house — take it out';
    if (hits.some((h) => h.where === 'bank')) return 'In your bank — equip it';
    if (hits.some((h) => h.where === 'worn')) return 'Equipped in another slot';
    return 'You own this';
  }

  function realItems(ladder) {
    return (ladder || []).filter((row) => row && row[0] && !isEmptyName(row[0]));
  }

  function matchRow(items, name) {
    if (!name) return null;
    return items.find((row) => namesMatch(row[0], name)) || null;
  }

  function isTwoHanded(name) {
    if (!name || typeof TWO_HANDED_WEAPONS === 'undefined') return false;
    return TWO_HANDED_WEAPONS.has(canonicalName(name));
  }

  function skipAmmoSlot(style, wornName) {
    return style !== 'ranged' && !wornName;
  }

  function adviseSlot(slot, style, entries) {
    const ladder = (GEAR[style] || {})[slot];
    const items = realItems(ladder);
    if (!items.length) return null;

    const wornName = wornInSlot(slot);
    if (skipAmmoSlot(style, wornName)) return null;

    if (slot === 'shield') {
      const wep = wornInSlot('weapon');
      if (isTwoHanded(wep)) {
        return {
          slot,
          wornName,
          currentName: wornName || 'Empty',
          nextName: null,
          nextReason: 'Not used with a two-handed weapon',
          status: 'skip',
          curPower: 0,
          nextPower: 0,
        };
      }
    }

    const current = matchRow(items, wornName);
    const curPower = current ? power(current, style) : (wornName ? 0 : -1);

    const ownedBetter = items
      .filter((row) => {
        if (!canWear(row)) return false;
        if (power(row, style) <= curPower + 0.4) return false;
        const hits = findOwned(row[0], entries);
        if (!hits.length) return false;
        if (wornName && namesMatch(wornName, row[0])) return false;
        return true;
      })
      .sort((a, b) => power(b, style) - power(a, style));

    if (ownedBetter[0]) {
      const next = ownedBetter[0];
      return {
        slot,
        wornName,
        currentName: wornName || (current ? current[0] : 'Empty'),
        nextName: next[0],
        nextReason: locationLabel(findOwned(next[0], entries)),
        status: 'equip',
        curPower,
        nextPower: power(next, style),
      };
    }

    const toGet = items
      .filter((row) => {
        if (findOwned(row[0], entries).length) return false;
        if (wornName && namesMatch(wornName, row[0])) return false;
        return power(row, style) > curPower + 0.4;
      })
      .sort((a, b) => power(a, style) - power(b, style));

    const next = toGet[0];
    if (!next) {
      return {
        slot,
        wornName,
        currentName: wornName || (current ? current[0] : 'Empty'),
        nextName: null,
        nextReason: current || wornName ? 'Best in slot for this style' : '',
        status: 'bis',
        curPower,
        nextPower: curPower,
      };
    }

    const wearable = canWear(next);
    return {
      slot,
      wornName,
      currentName: wornName || (current ? current[0] : 'Empty'),
      nextName: next[0],
      nextReason: wearable
        ? 'Next upgrade — obtain it'
        : ('Needs ' + (missingReqs(next).slice(0, 2).join(', ') || 'requirements')),
      status: wearable ? 'obtain' : 'locked',
      curPower,
      nextPower: power(next, style),
    };
  }

  function metaLoadout(style, entries) {
    const slots = typeof SLOT_ORDER !== 'undefined' ? SLOT_ORDER : Object.keys(GEAR[style] || {});
    return slots.map((slot) => {
      const items = realItems((GEAR[style] || {})[slot]);
      const wearable = items.filter(canWear);
      const best = wearable.slice().sort((a, b) => power(b, style) - power(a, style))[0];
      const ownedBest = wearable
        .filter((row) => findOwned(row[0], entries).length)
        .sort((a, b) => power(b, style) - power(a, style))[0];
      const wornName = wornInSlot(slot);
      const wearingBest = !!(best && wornName && namesMatch(wornName, best[0]));
      const ownBest = !!(best && findOwned(best[0], entries).length);
      return {
        slot,
        recommended: best ? best[0] : null,
        ownedBest: ownedBest ? ownedBest[0] : null,
        wornName,
        wearingBest,
        ownBest,
        locked: !best && items.length > 0,
      };
    }).filter((row) => {
      if (row.slot === 'ammo' && style !== 'ranged') return false;
      return row.recommended || row.wornName;
    });
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function iconFor(name) {
    if (!name || isEmptyName(name)) return '';
    if (typeof itemIconHtml === 'function') return itemIconHtml(name, { alt: name, name });
    return '';
  }

  window.setUpgradeStyle = function (style, btn) {
    upgradeStyle = style;
    document.querySelectorAll('#upgradeStyleBtns .style-btn').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderUpgrades();
  };

  window.__computeUpgrades = function (style) {
    const st = style || upgradeStyle;
    const entries = ownedEntries();
    const slots = typeof SLOT_ORDER !== 'undefined' ? SLOT_ORDER : Object.keys(GEAR[st] || {});
    const advice = [];
    for (const slot of slots) {
      const row = adviseSlot(slot, st, entries);
      if (row) advice.push(row);
    }
    return { style: st, advice, loadout: metaLoadout(st, entries) };
  };

  window.renderUpgrades = function renderUpgrades() {
    const root = document.getElementById('upgradesRoot');
    if (!root) return;
    if (typeof GEAR === 'undefined') {
      root.innerHTML = '<div class="hint">Gear data failed to load.</div>';
      return;
    }
    if (!playerSkills?.attack) {
      root.innerHTML = '<div class="hint">Sync a character to get personalised upgrade suggestions.</div>';
      return;
    }

    const { advice, loadout } = window.__computeUpgrades(upgradeStyle);
    const cards = advice.map((row) => {
      const delta = row.nextName ? (row.nextPower - row.curPower) : 0;
      const deltaTxt = row.status === 'equip' || row.status === 'obtain'
        ? (delta > 0.4 ? ` · +${delta.toFixed(0)} power` : '')
        : '';
      const nextLabel = row.nextName || (row.status === 'bis' ? 'Best owned' : '—');
      return `
        <div class="upgrade-card ${row.status}">
          <div class="upgrade-slot">${esc(slotLabel(row.slot))}</div>
          <div class="upgrade-now">
            <span class="muted">Now</span>
            <strong>${iconFor(row.currentName)}${esc(row.currentName)}</strong>
          </div>
          <div class="upgrade-arrow">→</div>
          <div class="upgrade-next">
            <span class="muted">Next</span>
            <strong>${iconFor(row.nextName)}${esc(nextLabel)}</strong>
            <span class="upgrade-reason">${esc(row.nextReason)}${esc(deltaTxt)}</span>
          </div>
        </div>`;
    });

    const loadoutHtml = loadout.map((row) => {
      const wear = row.ownedBest || row.recommended;
      const goal = row.recommended && row.ownedBest && row.recommended !== row.ownedBest
        ? row.recommended
        : null;
      let state = 'missing';
      let note = row.locked ? 'Locked' : 'Not owned';
      if (row.wearingBest) { state = 'worn'; note = 'Equipped'; }
      else if (row.ownedBest && row.wornName && namesMatch(row.wornName, row.ownedBest)) {
        state = 'owned';
        note = goal ? ('Goal: ' + goal) : 'Equipped';
      }
      else if (row.ownedBest) { state = 'owned'; note = goal ? ('Goal: ' + goal) : 'Equip this'; }
      return `
        <div class="upgrade-meta-slot ${state}" title="${esc(note)}">
          <div class="upgrade-meta-label">${esc(slotLabel(row.slot))}</div>
          <div class="upgrade-meta-item">${iconFor(wear)}<span>${esc(wear || '—')}</span></div>
          <div class="upgrade-meta-note">${esc(note)}</div>
        </div>`;
    }).join('');

    const styleBlurb = {
      melee: 'Slash/stab PvM: scimitar → whip/tent → fang, torso/Bandos, defender, torture, fire/infernal cape, prims, barrows/ferocious gloves, berserker (i)/ultor.',
      ranged: 'D\'hide → blessed/void → crystal/Armadyl/Masori. Ava\'s devices, anguish, blowpipe/Bowfa/tbow, pegasians, zaryte vambraces.',
      magic: 'Mystic → Ahrim/Virtus/Ancestral. Occult, imbued god cape, swamp trident/Sang/Shadow, tormented bracelet, eternals, magus ring.',
    };

    root.innerHTML = `
      <div class="goal-intro">
        <h2>Upgrade advisor</h2>
        <p>Uses your worn gear, bank and inventory. If you already own a better piece, it tells you to equip it — it will not suggest bronze over Bandos.</p>
      </div>
      <div class="equip-style-tabs" id="upgradeStyleBtns">
        <button type="button" class="style-btn${upgradeStyle === 'melee' ? ' active' : ''}" onclick="setUpgradeStyle('melee',this)">Melee</button>
        <button type="button" class="style-btn${upgradeStyle === 'ranged' ? ' active' : ''}" onclick="setUpgradeStyle('ranged',this)">Ranged</button>
        <button type="button" class="style-btn${upgradeStyle === 'magic' ? ' active' : ''}" onclick="setUpgradeStyle('magic',this)">Magic</button>
      </div>
      <p class="hint">${styleBlurb[upgradeStyle]}</p>
      ${!equipSynced && !bankSynced ? '<p class="hint">Wear gear and enable bank sync for better suggestions — skill/quest gates still work without them.</p>' : ''}
      <h3 class="upgrade-meta-title">Recommended ${esc(upgradeStyle)} setup for your levels</h3>
      <div class="upgrade-meta">${loadoutHtml}</div>
      <h3 class="upgrade-meta-title">Per slot</h3>
      <div class="upgrade-grid">${cards.join('') || '<p class="hint">No upgrades found for this style.</p>'}</div>
    `;
  };
})();
