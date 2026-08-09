/**
 * Optimal quest guide with auto-checkoff from synced quests + diaries.
 * Manual steps (train/mini/unlock) persist in localStorage per RSN.
 */
(function () {
  'use strict';

  let guideFilter = 'remaining'; // remaining | all | next

  function manualKey() {
    return 'osrs_guide_manual_' + (playerRSN || 'guest').toLowerCase();
  }

  function loadManual() {
    try {
      return JSON.parse(localStorage.getItem(manualKey()) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveManual(map) {
    localStorage.setItem(manualKey(), JSON.stringify(map));
  }

  function stepKey(step, idx) {
    if (step.t === 'q') return 'q:' + step.n;
    if (step.t === 'diary') return 'diary:' + step.region + ':' + step.tier;
    if (step.t === 'mini') return 'mini:' + step.n;
    return step.t + ':' + idx + ':' + (step.label || step.n || '');
  }

  function isStepDone(step, idx, manual) {
    if (step.t === 'q') {
      if (typeof questsDone !== 'undefined' && questsDone.has(step.n)) return true;
      // RFD subquests: parent completion counts
      if (step.parent && questsDone.has(step.parent)) return true;
      // Alias: some wiki names differ slightly
      if (step.n && typeof questsDone !== 'undefined') {
        for (const q of questsDone) {
          if (q.toLowerCase() === step.n.toLowerCase()) return true;
        }
      }
      return !!manual[stepKey(step, idx)];
    }
    if (step.t === 'diary') {
      if (typeof diaryComplete === 'function' && diaryComplete(step.region, step.tier)) return true;
      return !!manual[stepKey(step, idx)];
    }
    if (step.t === 'note') return false;
    return !!manual[stepKey(step, idx)];
  }

  window.toggleGuideStep = function (idx) {
    const guide = typeof OPTIMAL_QUEST_GUIDE !== 'undefined' ? OPTIMAL_QUEST_GUIDE : [];
    const step = guide[idx];
    if (!step || step.t === 'note' || step.t === 'q' || step.t === 'diary') return;
    const manual = loadManual();
    const key = stepKey(step, idx);
    if (manual[key]) delete manual[key];
    else manual[key] = 1;
    saveManual(manual);
    renderQuestGuide();
  };

  window.setGuideFilter = function (f, btn) {
    guideFilter = f;
    document.querySelectorAll('#guideFilterBtns .filter-btn').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderQuestGuide();
  };

  function stepTitle(step) {
    if (step.t === 'q') return step.n + (step.parent ? '' : '');
    if (step.t === 'diary') {
      const d = (typeof ACHIEVEMENT_DIARIES !== 'undefined' ? ACHIEVEMENT_DIARIES : []).find((x) => x.id === step.region);
      return `${step.tier.charAt(0).toUpperCase() + step.tier.slice(1)} ${d ? d.label : step.region} Diary`;
    }
    if (step.t === 'mini') return step.n + ' (miniquest)';
    return step.label || step.n || '';
  }

  function typeBadge(t) {
    const labels = { q: 'Quest', mini: 'Mini', diary: 'Diary', train: 'Train', unlock: 'Unlock', note: 'Note' };
    return labels[t] || t;
  }

  window.renderQuestGuide = function renderQuestGuide() {
    const root = document.getElementById('guideRoot');
    if (!root) return;
    const guide = typeof OPTIMAL_QUEST_GUIDE !== 'undefined' ? OPTIMAL_QUEST_GUIDE : null;
    if (!guide) {
      root.innerHTML = '<div class="hint">Quest guide data failed to load.</div>';
      return;
    }
    const manual = loadManual();
    const annotated = guide.map((step, idx) => ({ step, idx, done: isStepDone(step, idx, manual) }));
    const trackable = annotated.filter((a) => a.step.t !== 'note');
    const doneCount = trackable.filter((a) => a.done).length;
    const nextIdx = annotated.findIndex((a) => a.step.t !== 'note' && !a.done);

    let visible = annotated;
    if (guideFilter === 'remaining') visible = annotated.filter((a) => a.step.t === 'note' || !a.done);
    if (guideFilter === 'next') {
      visible = nextIdx >= 0 ? annotated.slice(nextIdx, nextIdx + 15) : [];
    }

    root.innerHTML = `
      <div class="goal-intro">
        <h2>Optimal quest guide</h2>
        <p>Wiki order that minimises skill training between quests. Quests and diaries auto-check from your sync; training steps you tick yourself. Source: <a href="https://oldschool.runescape.wiki/w/Optimal_quest_guide" target="_blank" rel="noopener">OSRS Wiki</a>.</p>
      </div>
      <div class="progress-stat-row">
        <div class="progress-stat"><div class="num">${doneCount}</div><div class="lbl">Steps done</div></div>
        <div class="progress-stat"><div class="num">${trackable.length - doneCount}</div><div class="lbl">Remaining</div></div>
        <div class="progress-stat"><div class="num">${Math.round((doneCount / Math.max(1, trackable.length)) * 100)}%</div><div class="lbl">Progress</div></div>
      </div>
      <div id="guideFilterBtns" class="quest-filter" style="margin-bottom:14px">
        <button type="button" class="filter-btn${guideFilter === 'remaining' ? ' active' : ''}" onclick="setGuideFilter('remaining',this)">Remaining</button>
        <button type="button" class="filter-btn${guideFilter === 'next' ? ' active' : ''}" onclick="setGuideFilter('next',this)">Next 15</button>
        <button type="button" class="filter-btn${guideFilter === 'all' ? ' active' : ''}" onclick="setGuideFilter('all',this)">Full guide</button>
      </div>
      <div class="guide-list">
        ${visible.map(({ step, idx, done }) => {
          const isNext = idx === nextIdx;
          const canToggle = step.t === 'train' || step.t === 'mini' || step.t === 'unlock';
          const wiki = step.t === 'q' || step.t === 'mini'
            ? `https://oldschool.runescape.wiki/w/${encodeURIComponent(step.n)}`
            : null;
          return `
            <div class="guide-row${done ? ' done' : ''}${isNext ? ' next' : ''}${step.t === 'note' ? ' note' : ''}">
              <div class="guide-check">
                ${step.t === 'note' ? '' : canToggle
                  ? `<button type="button" class="guide-check-btn" onclick="toggleGuideStep(${idx})" aria-label="Toggle">${done ? '✓' : ''}</button>`
                  : `<span class="guide-check-auto" title="Auto from sync">${done ? '✓' : ''}</span>`}
              </div>
              <div class="guide-main">
                <div class="guide-title">
                  <span class="guide-badge ${step.t}">${typeBadge(step.t)}</span>
                  ${wiki ? `<a href="${wiki}" target="_blank" rel="noopener">${stepTitle(step)}</a>` : `<span>${stepTitle(step)}</span>`}
                  ${step.qp ? `<span class="guide-qp">${step.qp} QP</span>` : ''}
                  ${isNext ? '<span class="guide-next-tag">Do next</span>' : ''}
                </div>
                ${step.info ? `<div class="guide-info">${step.info}</div>` : ''}
              </div>
            </div>`;
        }).join('') || '<p class="hint">Nothing left — quest point cape time.</p>'}
      </div>
    `;
  };
})();
