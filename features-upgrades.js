/**
 * Gear upgrade advisor — next upgrade per slot from GEAR ladder + owned items.
 * Uses GEAR / SLOT_ORDER from game-data.js and wornGear / playerBank / playerSkills.
 */
(function () {
  'use strict';

  let upgradeStyle = 'melee';

  // Bonus index used as the "power" score for ranking upgrades within a style.
  const POWER_INDEX = {
    melee: 6,   // melee strength
    ranged: 7,  // ranged strength
    magic: 3,   // magic attack (mage gear is accuracy-driven; + magic dmg is index 8)
  };

  function skillLevel(sk) {
    return playerSkills?.[sk]?.level || 1;
  }

  function questDone(name) {
    if (!name) return true;
    return typeof questsDone !== 'undefined' && questsDone.has(name);
  }

  function ownedNames() {
    const set = new Set();
    for (const n of Object.values(wornGear || {})) {
      if (n) set.add(String(n).toLowerCase());
    }
    for (const row of playerBank || []) {
      if (row.item_name) set.add(String(row.item_name).toLowerCase());
    }
    for (const row of playerInventory || []) {
      if (row.item_name) set.add(String(row.item_name).toLowerCase());
    }
    return set;
  }

  function owns(name, owned) {
    const needle = name.toLowerCase();
    if (owned.has(needle)) return true;
    // substring match for charged/trimmed variants
    for (const o of owned) {
      if (o.includes(needle) || needle.includes(o)) return true;
    }
    return false;
  }

  function canWear(row) {
    // row: [name, ...bonuses, defReq, atkReq, rngReq, magReq, questReq, slayerReq]
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
    if (questReq && !questDone(questReq)) return false;
    return true;
  }

  function power(row, style) {
    const idx = POWER_INDEX[style] ?? 6;
    let score = row[idx] || 0;
    if (style === 'magic') score += (row[8] || 0) * 10; // magic damage % heavily weighted
    if (style === 'melee') score += (row[1] + row[2] + row[3]) * 0.05; // slight accuracy tie-break
    return score;
  }

  function slotLabel(slot) {
    if (typeof SLOT_LABELS !== 'undefined' && SLOT_LABELS[slot]) return SLOT_LABELS[slot];
    return slot.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function wornInSlot(slot) {
    const want = (typeof canonicalEquipSlot === 'function') ? canonicalEquipSlot(slot) : slot;
    if (wornGear && wornGear[want]) return wornGear[want];
    // Map simulator slot names to wornGear slot names used by the plugin
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

  window.setUpgradeStyle = function (style, btn) {
    upgradeStyle = style;
    document.querySelectorAll('#upgradeStyleBtns .style-btn').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderUpgrades();
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

    const styleGear = GEAR[upgradeStyle] || {};
    const owned = ownedNames();
    const slots = (typeof SLOT_ORDER !== 'undefined' ? SLOT_ORDER : Object.keys(styleGear));
    const cards = [];

    for (const slot of slots) {
      const ladder = styleGear[slot];
      if (!Array.isArray(ladder) || ladder.length < 2) continue;

      const wornName = wornInSlot(slot);
      let current = null;
      let currentIdx = -1;
      for (let i = 0; i < ladder.length; i++) {
        if (ladder[i][0] === 'None') continue;
        if (wornName && owns(ladder[i][0], new Set([wornName.toLowerCase()]))) {
          current = ladder[i];
          currentIdx = i;
          break;
        }
      }
      // Bank/inventory fallback only when the slot is actually empty — never
      // pretend a banked item is "Now" while something else is worn.
      if (!current && !wornName) {
        for (let i = ladder.length - 1; i >= 0; i--) {
          if (ladder[i][0] === 'None') continue;
          if (owns(ladder[i][0], owned)) {
            current = ladder[i];
            currentIdx = i;
            break;
          }
        }
      }

      const curPower = current ? power(current, upgradeStyle) : -1;
      let next = null;
      let nextReason = '';
      for (let i = Math.max(0, currentIdx + 1); i < ladder.length; i++) {
        const row = ladder[i];
        if (row[0] === 'None') continue;
        if (power(row, upgradeStyle) <= curPower) continue;
        if (owns(row[0], owned) && current && row[0] === current[0]) continue;
        if (canWear(row)) {
          next = row;
          nextReason = owns(row[0], owned) ? 'In your bank — equip it' : 'Ready to wear';
          break;
        }
        // First locked upgrade — show as the goal with missing reqs
        if (!next) {
          const missing = [];
          if (skillLevel('defence') < (row[13] || 1)) missing.push(`Def ${skillLevel('defence')}/${row[13]}`);
          if (skillLevel('attack') < (row[14] || 1)) missing.push(`Atk ${skillLevel('attack')}/${row[14]}`);
          if (skillLevel('ranged') < (row[15] || 1)) missing.push(`Range ${skillLevel('ranged')}/${row[15]}`);
          if (skillLevel('magic') < (row[16] || 1)) missing.push(`Mage ${skillLevel('magic')}/${row[16]}`);
          if ((row[18] || 0) && skillLevel('slayer') < row[18]) missing.push(`Slayer ${skillLevel('slayer')}/${row[18]}`);
          if (row[17] && !questDone(row[17])) missing.push(row[17]);
          next = row;
          nextReason = 'Needs ' + (missing.slice(0, 2).join(', ') || 'requirements');
          break;
        }
      }

      if (!next && !current) continue;

      const delta = next && current ? (power(next, upgradeStyle) - curPower) : null;
      cards.push(`
        <div class="upgrade-card">
          <div class="upgrade-slot">${slotLabel(slot)}</div>
          <div class="upgrade-now">
            <span class="muted">Now</span>
            <strong>${current ? current[0] : (wornName || 'Empty')}</strong>
          </div>
          <div class="upgrade-arrow">→</div>
          <div class="upgrade-next">
            <span class="muted">Next</span>
            <strong>${next ? next[0] : 'Best owned'}</strong>
            <span class="upgrade-reason">${next ? nextReason : ''}${delta != null && delta > 0 ? ` · +${delta.toFixed(0)} power` : ''}</span>
          </div>
        </div>`);
    }

    root.innerHTML = `
      <div class="goal-intro">
        <h2>Upgrade advisor</h2>
        <p>Next gear upgrade per slot for your account — based on worn gear, bank, stats and quest unlocks. Power score weighs the main offensive bonus for the selected style.</p>
      </div>
      <div class="equip-style-tabs" id="upgradeStyleBtns">
        <button type="button" class="style-btn${upgradeStyle === 'melee' ? ' active' : ''}" onclick="setUpgradeStyle('melee',this)">Melee</button>
        <button type="button" class="style-btn${upgradeStyle === 'ranged' ? ' active' : ''}" onclick="setUpgradeStyle('ranged',this)">Ranged</button>
        <button type="button" class="style-btn${upgradeStyle === 'magic' ? ' active' : ''}" onclick="setUpgradeStyle('magic',this)">Magic</button>
      </div>
      ${!equipSynced && !bankSynced ? '<p class="hint">Wear gear and enable bank sync for better suggestions — skill/quest gates still work without them.</p>' : ''}
      <div class="upgrade-grid">${cards.join('') || '<p class="hint">No upgrades found for this style.</p>'}</div>
    `;
  };
})();
