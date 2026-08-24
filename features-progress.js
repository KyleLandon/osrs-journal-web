/**
 * Progress tab — XP gains charts + net worth history.
 * Depends on globals from osrs-journal.html: snapshotRows, skillGains, playerSkills,
 * netWorthHistory, bankValueEstimate, formatXp, formatGold, sparklineSvg,
 * viewingOwnCharacter, SKILL_DEFS, XP_TABLE.
 */
(function () {
  'use strict';

  let progressRange = 30; // days
  let progressSkill = 'overall';

  window.setProgressRange = function (days, btn) {
    progressRange = days;
    document.querySelectorAll('#progressRangeBtns .filter-btn').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderProgress();
  };

  window.setProgressSkill = function (skill) {
    progressSkill = skill || 'overall';
    renderProgress();
  };

  function daysAgo(n) {
    return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  }

  function rowInstant(r) {
    if (typeof snapshotInstant === 'function') return snapshotInstant(r);
    if (r?.snapped_at) return String(r.snapped_at);
    if (r?.snap_date) return String(r.snap_date).slice(0, 10) + 'T00:00:00.000Z';
    return '';
  }

  function rowDay(r) {
    if (typeof snapshotDay === 'function') return snapshotDay(r);
    if (r?.snap_date) return String(r.snap_date).slice(0, 10);
    return rowInstant(r).slice(0, 10);
  }

  function snapChartLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(5, 10);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' });
  }

  function seriesForSkill(skill, since) {
    if (!snapshotRows?.length) return [];
    const byTs = {};
    for (const r of snapshotRows) {
      const day = rowDay(r);
      if (!day || day < since) continue;
      const ts = rowInstant(r);
      if (!ts) continue;
      if (skill === 'overall') {
        if (r.skill === 'overall') continue;
        byTs[ts] = (byTs[ts] || 0) + (r.xp || 0);
      } else if (r.skill === skill) {
        byTs[ts] = r.xp || 0;
      }
    }
    return Object.keys(byTs).sort().map((d) => ({ date: d, xp: byTs[d] }));
  }

  function lastPerUtcDay(series) {
    const byDay = {};
    for (const s of series) {
      const day = String(s.date).slice(0, 10);
      byDay[day] = s;
    }
    return Object.keys(byDay).sort().map((day) => ({ date: day, xp: byDay[day].xp }));
  }

  function dailyGains(series) {
    const daily = lastPerUtcDay(series);
    const out = [];
    for (let i = 1; i < daily.length; i++) {
      out.push({ date: daily[i].date, gain: Math.max(0, daily[i].xp - daily[i - 1].xp) });
    }
    if (daily.length && playerSkills) {
      const today = new Date().toISOString().slice(0, 10);
      let live;
      if (progressSkill === 'overall') {
        live = Object.entries(playerSkills).reduce((s, [k, v]) => (k === 'overall' ? s : s + (v.xp || 0)), 0);
      } else {
        live = playerSkills[progressSkill]?.xp;
      }
      if (live != null) {
        const last = daily[daily.length - 1];
        if (last.date < today) {
          out.push({ date: today, gain: Math.max(0, live - last.xp) });
        } else if (daily.length >= 2) {
          out[out.length - 1] = { date: today, gain: Math.max(0, live - daily[daily.length - 2].xp) };
        } else {
          out.push({ date: today, gain: Math.max(0, live - last.xp) });
        }
      }
    }
    return out;
  }

  function chartSvg(points, { width = 640, height = 180, color = 'var(--accent)', fill = true } = {}) {
    if (!points || points.length < 2) {
      return '<div class="spark-empty">Not enough history yet — keep the plugin syncing for a few hours.</div>';
    }
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const coords = values.map((v, i) => {
      const x = (i / (values.length - 1)) * (width - 8) + 4;
      const y = height - 8 - ((v - min) / span) * (height - 16);
      return [x, y];
    });
    const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `4,${height - 4} ${line} ${(width - 4).toFixed(1)},${height - 4}`;
    const last = points[points.length - 1];
    const first = points[0];
    return `<svg viewBox="0 0 ${width} ${height}" class="progress-chart" preserveAspectRatio="none" role="img" aria-label="Chart">
      ${fill ? `<polygon points="${area}" fill="currentColor" opacity="0.12"/>` : ''}
      <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
    <div class="progress-chart-axis">
      <span>${first.label || first.date || ''}</span>
      <span>${formatXp(max)} peak · now ${formatXp(last.value)}</span>
      <span>${last.label || last.date || ''}</span>
    </div>`;
  }

  function barChartSvg(gains, { width = 640, height = 140 } = {}) {
    if (!gains || !gains.length) {
      return '<div class="spark-empty">Daily gains appear after two sync days.</div>';
    }
    const max = Math.max(...gains.map((g) => g.gain), 1);
    const gap = 3;
    const barW = Math.max(4, (width - gap * (gains.length + 1)) / gains.length);
    const bars = gains.map((g, i) => {
      const h = Math.max(2, (g.gain / max) * (height - 20));
      const x = gap + i * (barW + gap);
      const y = height - 12 - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="currentColor" opacity="${g.gain ? 0.85 : 0.25}">
        <title>${g.date}: ${formatXp(g.gain)} XP</title>
      </rect>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" class="progress-bars" preserveAspectRatio="none" role="img">${bars}</svg>`;
  }

  function topSkills(kind, limit = 8) {
    if (!skillGains) return [];
    return Object.entries(skillGains)
      .filter(([, g]) => g[kind] != null && g[kind] > 0)
      .sort((a, b) => b[1][kind] - a[1][kind])
      .slice(0, limit);
  }

  function personalRecords() {
    if (!snapshotRows?.length) return [];
    const bySkillDate = {};
    const lastTs = {};
    for (const r of snapshotRows) {
      if (r.skill === 'overall') continue;
      const day = rowDay(r);
      const ts = rowInstant(r);
      if (!day || !ts) continue;
      const key = r.skill + '\0' + day;
      if (!lastTs[key] || ts >= lastTs[key]) {
        lastTs[key] = ts;
        if (!bySkillDate[r.skill]) bySkillDate[r.skill] = {};
        bySkillDate[r.skill][day] = r.xp;
      }
    }
    const records = [];
    for (const [skill, dates] of Object.entries(bySkillDate)) {
      const ordered = Object.keys(dates).sort();
      let best = 0;
      let bestDate = null;
      for (let i = 1; i < ordered.length; i++) {
        const gain = dates[ordered[i]] - dates[ordered[i - 1]];
        if (gain > best) {
          best = gain;
          bestDate = ordered[i];
        }
      }
      if (best > 0) records.push({ skill, gain: best, date: bestDate });
    }
    return records.sort((a, b) => b.gain - a.gain).slice(0, 5);
  }

  function skillSelectOptions() {
    const skills = Object.keys(typeof SKILL_DEFS !== 'undefined' ? SKILL_DEFS : {})
      .filter((s) => s !== 'overall')
      .sort();
    return ['overall', ...skills]
      .map((s) => `<option value="${s}"${s === progressSkill ? ' selected' : ''}>${s === 'overall' ? 'Overall XP' : formatSkillName(s)}</option>`)
      .join('');
  }

  window.renderProgress = function renderProgress() {
    const root = document.getElementById('progressRoot');
    if (!root) return;
    if (!playerSkills?.attack) {
      root.innerHTML = '<div class="hint">Sync a character to see XP and wealth history.</div>';
      return;
    }

    const since = daysAgo(progressRange);
    const series = seriesForSkill(progressSkill, since);
    const linePoints = series.map((s) => ({ date: s.date, value: s.xp, label: snapChartLabel(s.date) }));
    if (series.length) {
      let live;
      if (progressSkill === 'overall') {
        live = Object.entries(playerSkills).reduce((s, [k, v]) => (k === 'overall' ? s : s + (v.xp || 0)), 0);
      } else {
        live = playerSkills[progressSkill]?.xp;
      }
      if (live != null) {
        const last = linePoints[linePoints.length - 1];
        if (!last || last.value !== live) {
          linePoints.push({ date: new Date().toISOString(), value: live, label: 'now' });
        } else if (last) {
          last.label = 'now';
        }
      }
    }

    const uniqueDays = new Set(series.map((s) => String(s.date).slice(0, 10))).size;

    const gains = dailyGains(series);
    const todayTotal = typeof totalXpGain === 'function' ? totalXpGain('today') : null;
    const weekTotal = typeof totalXpGain === 'function' ? totalXpGain('week') : null;
    const topToday = topSkills('today');
    const topWeek = topSkills('week');
    const records = personalRecords();

    let wealthBlock = '';
    if (viewingOwnCharacter) {
      const bankVal = typeof bankValueEstimate === 'function' ? bankValueEstimate() : null;
      const hist = (netWorthHistory || []).filter((r) => r.snap_date >= since);
      const wealthPoints = hist.map((r) => ({ date: r.snap_date, value: r.value, label: r.snap_date.slice(5) }));
      if (bankVal != null && (!wealthPoints.length || wealthPoints[wealthPoints.length - 1].date !== new Date().toISOString().slice(0, 10))) {
        wealthPoints.push({ date: 'today', value: bankVal, label: 'today' });
      } else if (bankVal != null && wealthPoints.length) {
        wealthPoints[wealthPoints.length - 1] = { date: 'today', value: bankVal, label: 'today' };
      }
      const weekDelta = typeof netWorthDeltaText === 'function' ? netWorthDeltaText() : '';
      wealthBlock = `
        <section class="progress-card">
          <div class="section-title">Net worth <span class="section-note">owner-only · GE estimate</span></div>
          <div class="progress-stat-row">
            <div class="progress-stat"><div class="num">${bankVal != null ? formatGold(bankVal) : '—'}</div><div class="lbl">Current bank</div></div>
            <div class="progress-stat"><div class="num">${weekDelta ? weekDelta.replace(/^ · /, '') : '—'}</div><div class="lbl">Weekly change</div></div>
            <div class="progress-stat"><div class="num">${hist.length}</div><div class="lbl">Days tracked</div></div>
          </div>
          <div class="progress-chart-wrap accent-gold">${chartSvg(wealthPoints, { color: 'var(--gold)' })}</div>
          ${!bankSynced ? '<p class="hint">Enable <strong>Sync Bank &amp; Inventory</strong> in the plugin for wealth tracking.</p>' : ''}
        </section>`;
    } else {
      wealthBlock = `<section class="progress-card"><div class="hint">Net worth history is private — only visible on your own linked character.</div></section>`;
    }

    root.innerHTML = `
      <div class="goal-intro">
        <h2>Progress</h2>
        <p>XP is snapshotted every 3 hours while you play. The line chart is intra-day; the bars are calendar-day totals.</p>
      </div>
      <div class="progress-toolbar">
        <div id="progressRangeBtns" class="quest-filter">
          <button type="button" class="filter-btn${progressRange === 7 ? ' active' : ''}" onclick="setProgressRange(7,this)">7d</button>
          <button type="button" class="filter-btn${progressRange === 14 ? ' active' : ''}" onclick="setProgressRange(14,this)">14d</button>
          <button type="button" class="filter-btn${progressRange === 30 ? ' active' : ''}" onclick="setProgressRange(30,this)">30d</button>
        </div>
        <label class="progress-skill-pick">Skill
          <select id="progressSkillSelect" onchange="setProgressSkill(this.value)">${skillSelectOptions()}</select>
        </label>
      </div>

      <div class="progress-stat-row">
        <div class="progress-stat"><div class="num">${todayTotal != null ? '+' + formatXp(todayTotal) : '—'}</div><div class="lbl">XP today</div></div>
        <div class="progress-stat"><div class="num">${weekTotal != null ? '+' + formatXp(weekTotal) : '—'}</div><div class="lbl">XP this week</div></div>
        <div class="progress-stat"><div class="num">${uniqueDays}</div><div class="lbl">Days tracked</div></div>
      </div>

      <section class="progress-card">
        <div class="section-title">${progressSkill === 'overall' ? 'Overall XP' : formatSkillName(progressSkill) + ' XP'}</div>
        <div class="progress-chart-wrap">${chartSvg(linePoints)}</div>
        <div class="section-title" style="margin-top:18px">Daily gains</div>
        <div class="progress-chart-wrap">${barChartSvg(gains)}</div>
      </section>

      <div class="progress-split">
        <section class="progress-card">
          <div class="section-title">Top skills today</div>
          ${topToday.length ? `<div class="progress-skill-list">${topToday.map(([sk, g]) =>
            `<button type="button" class="progress-skill-row" onclick="setProgressSkill('${sk}');document.getElementById('progressSkillSelect').value='${sk}'">
              <span>${formatSkillName(sk)}</span><span class="gain">+${formatXp(g.today)}</span>
            </button>`).join('')}</div>` : '<p class="hint">No gains recorded for today yet.</p>'}
        </section>
        <section class="progress-card">
          <div class="section-title">Top skills this week</div>
          ${topWeek.length ? `<div class="progress-skill-list">${topWeek.map(([sk, g]) =>
            `<button type="button" class="progress-skill-row" onclick="setProgressSkill('${sk}');document.getElementById('progressSkillSelect').value='${sk}'">
              <span>${formatSkillName(sk)}</span><span class="gain">+${formatXp(g.week)}</span>
            </button>`).join('')}</div>` : '<p class="hint">Need a few days of sync history.</p>'}
        </section>
      </div>

      <section class="progress-card">
        <div class="section-title">Personal records <span class="section-note">best single day per skill</span></div>
        ${records.length ? `<div class="progress-skill-list">${records.map((r) =>
          `<div class="progress-skill-row static">
            <span>${formatSkillName(r.skill)}</span>
            <span class="gain">+${formatXp(r.gain)} <span class="muted">on ${r.date}</span></span>
          </div>`).join('')}</div>` : '<p class="hint">Records unlock after multiple sync days.</p>'}
      </section>

      ${wealthBlock}
    `;
  };
})();
