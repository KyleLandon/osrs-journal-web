/**
 * Skill calculator — pre-filled with live XP from the synced character.
 * Uses CALC_METHODS + XP_TABLE from game-data.js and gePrices/geMapping from the page.
 */
(function () {
  'use strict';

  let calcSkill = 'cooking';
  let calcTarget = 99;

  function xpForLevel(level) {
    if (typeof XP_TABLE === 'undefined') return 0;
    const lv = Math.max(1, Math.min(99, level | 0));
    return XP_TABLE[lv] || 0;
  }

  function currentXp(skill) {
    const d = playerSkills?.[skill];
    if (!d) return 0;
    return d.xp || xpForLevel(d.level || 1);
  }

  function currentLevel(skill) {
    return playerSkills?.[skill]?.level || 1;
  }

  function priceOf(name) {
    if (!name) return null;
    if (name.toLowerCase() === 'coins') return 1;
    if (typeof gePriceByName === 'function') {
      const p = gePriceByName(name);
      return typeof p === 'number' ? p : null;
    }
    return null;
  }

  function methodCost(method) {
    let cost = 0;
    let known = false;
    for (const inp of method.inputs || []) {
      const p = priceOf(inp.n);
      if (p == null) return null;
      cost += p * (inp.q || 1);
      known = true;
    }
    for (const out of method.outputs || []) {
      const p = priceOf(out.n);
      if (p == null) continue;
      cost -= p * (out.q || 1);
      known = true;
    }
    return known ? cost : null;
  }

  function formatHours(h) {
    if (h == null || !Number.isFinite(h)) return '—';
    if (h < 1) return Math.round(h * 60) + ' min';
    if (h < 24) return h.toFixed(1) + ' hr';
    return (h / 24).toFixed(1) + ' days';
  }

  function formatGp(n) {
    if (n == null) return '—';
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    const abs = Math.abs(Math.round(n));
    if (typeof formatGold === 'function') return sign + formatGold(abs);
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(0) + 'K';
    return sign + String(abs);
  }

  window.setCalcSkill = function (skill) {
    calcSkill = skill;
    const lv = currentLevel(skill);
    // Default target: next nice breakpoint (or 99)
    const nice = [10, 20, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 99].find((n) => n > lv) || 99;
    calcTarget = nice;
    renderCalculator();
  };

  window.setCalcTarget = function (level) {
    const n = Math.max(1, Math.min(99, parseInt(level, 10) || 99));
    calcTarget = n;
    renderCalculator();
  };

  window.renderCalculator = function renderCalculator() {
    const root = document.getElementById('calcRoot');
    if (!root) return;
    if (typeof CALC_METHODS === 'undefined') {
      root.innerHTML = '<div class="hint">Calculator data failed to load.</div>';
      return;
    }

    const skills = Object.keys(CALC_METHODS).sort();
    if (!CALC_METHODS[calcSkill]) calcSkill = skills[0];
    const methods = CALC_METHODS[calcSkill] || [];
    const curXp = currentXp(calcSkill);
    const curLv = currentLevel(calcSkill);
    const targetXp = xpForLevel(calcTarget);
    const needed = Math.max(0, targetXp - curXp);
    const synced = !!playerSkills?.[calcSkill];

    // Goal skill shortcut: if main goal needs a skill, hint it
    let goalHint = '';
    try {
      if (typeof getMainGoal === 'function' || typeof getPlayerGoals === 'function') {
        /* optional */
      }
    } catch (_) {}

    const rows = methods.map((m) => {
      const locked = curLv < m.level;
      const actions = m.xp > 0 ? Math.ceil(needed / m.xp) : null;
      // Methods with perHour==1 and huge xp are "XP/hr" style — treat xp as hourly rate
      const isRate = m.perHour === 1 && m.xp >= 1000;
      let hours = null;
      if (isRate && m.xp > 0) {
        hours = needed / m.xp;
      } else if (actions != null && m.perHour > 0) {
        hours = actions / m.perHour;
      }
      const unitCost = methodCost(m);
      const totalCost = unitCost != null && actions != null && !isRate ? unitCost * actions : null;
      const gpHr = unitCost != null && m.perHour > 0 && !isRate ? unitCost * m.perHour : null;
      return { m, locked, actions, hours, unitCost, totalCost, gpHr, isRate };
    }).sort((a, b) => {
      if (a.locked !== b.locked) return a.locked ? 1 : -1;
      return (a.hours ?? 1e9) - (b.hours ?? 1e9);
    });

    root.innerHTML = `
      <div class="calc-toolbar">
        <div class="calc-skill-grid">
          ${skills.map((s) => {
            const lv = playerSkills?.[s]?.level;
            return `<button type="button" class="calc-skill-btn${s === calcSkill ? ' active' : ''}" onclick="setCalcSkill('${s}')">
              <span class="calc-skill-name">${formatSkillName(s)}</span>
              <span class="calc-skill-lv">${lv != null ? lv : '—'}</span>
            </button>`;
          }).join('')}
        </div>
      </div>

      <section class="progress-card">
        <div class="calc-target-row">
          <div>
            <div class="section-title" style="margin:0">${formatSkillName(calcSkill)}</div>
            <p class="hint" style="margin:4px 0 0">${synced
              ? `Live: level <strong>${curLv}</strong> · ${formatXp(curXp)} XP`
              : 'Sync a character to pre-fill your XP — or browse methods below.'}</p>
          </div>
          <label class="calc-target-label">Target level
            <input type="number" id="calcTargetInput" min="1" max="99" value="${calcTarget}"
              onchange="setCalcTarget(this.value)" onkeydown="if(event.key==='Enter')setCalcTarget(this.value)">
          </label>
        </div>
        <div class="progress-stat-row">
          <div class="progress-stat"><div class="num">${formatXp(needed)}</div><div class="lbl">XP needed</div></div>
          <div class="progress-stat"><div class="num">${curLv} → ${calcTarget}</div><div class="lbl">Levels</div></div>
          <div class="progress-stat"><div class="num">${needed === 0 ? 'Done' : formatHours(rows.find((r) => !r.locked)?.hours)}</div><div class="lbl">Fastest estimate</div></div>
        </div>
        ${goalHint}
      </section>

      <section class="progress-card">
        <div class="section-title">Training methods <span class="section-note">sorted by estimated time · GE prices when available</span></div>
        <div class="calc-method-list">
          ${rows.map(({ m, locked, actions, hours, unitCost, totalCost, gpHr, isRate }) => `
            <div class="calc-method${locked ? ' locked' : ''}">
              <div class="calc-method-head">
                <strong>${m.name}</strong>
                <span class="calc-method-lv">${locked ? 'Needs ' + m.level : 'Lvl ' + m.level}</span>
              </div>
              <div class="calc-method-stats">
                <span>${isRate ? formatXp(m.xp) + '/hr' : m.xp + ' XP/action'}</span>
                <span>${actions != null && !isRate ? actions.toLocaleString() + ' actions' : (isRate ? formatHours(hours) : '—')}</span>
                <span>${formatHours(hours)}</span>
                <span title="GP per action">${unitCost == null ? '—' : formatGp(-unitCost) + '/ea'}</span>
                <span title="Total GE cost/profit for goal">${totalCost == null ? (gpHr != null ? formatGp(-gpHr) + '/hr' : '—') : formatGp(-totalCost) + ' total'}</span>
              </div>
              ${m.note ? `<div class="calc-method-note">${m.note}</div>` : ''}
            </div>
          `).join('') || '<p class="hint">No methods for this skill yet.</p>'}
        </div>
        <p class="hint" style="margin-top:12px">Rates are estimates. Negative totals are a cost; positive means the method profits at current GE prices.</p>
      </section>
    `;
  };
})();
