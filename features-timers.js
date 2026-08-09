/**
 * Activity timers — herb runs, birdhouses, dailies/weeklies + browser notifications.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'osrs_timers';
  let tickHandle = null;

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function nextUtcMidnight() {
    const d = new Date();
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0));
    return next.getTime();
  }

  function nextUtcWednesday() {
    const d = new Date();
    const day = d.getUTCDay(); // 0=Sun … 3=Wed
    let add = (3 - day + 7) % 7;
    if (add === 0 && (d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds())) {
      // already Wednesday — if past midnight UTC, still today until end; treat as next week if we want reset-at-midnight
      // Weekly resets at Wednesday 00:00 UTC — if we're Wednesday after midnight, next is +7
      add = 7;
    }
    if (add === 0) add = 7;
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add, 0, 0, 0));
    return next.getTime();
  }

  function formatRemaining(ms) {
    if (ms <= 0) return 'Ready';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h >= 24) {
      const days = Math.floor(h / 24);
      return `${days}d ${h % 24}h`;
    }
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  function notify(title, body) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body, icon: 'assets/icon.png' });
    } catch (_) {}
  }

  window.requestTimerNotifications = async function () {
    if (typeof Notification === 'undefined') {
      showToast('Notifications not supported in this browser', 'error');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') showToast('Notifications enabled — we\'ll ping when timers finish', 'ok');
    else showToast('Notification permission denied', 'error');
    renderTimers();
  };

  window.startTimer = function (id) {
    const preset = (typeof TIMER_PRESETS !== 'undefined' ? TIMER_PRESETS : []).find((t) => t.id === id);
    if (!preset) return;
    const state = loadState();
    state[id] = {
      endsAt: Date.now() + preset.mins * 60 * 1000,
      label: preset.label,
      notified: false,
    };
    saveState(state);
    showToast(`${preset.label} started — ${preset.mins} min`, 'ok');
    renderTimers();
    ensureTicking();
  };

  window.resetTimer = function (id) {
    const state = loadState();
    delete state[id];
    saveState(state);
    renderTimers();
  };

  window.restartTimer = function (id) {
    startTimer(id);
  };

  function ensureTicking() {
    if (tickHandle) return;
    tickHandle = setInterval(() => {
      const state = loadState();
      let changed = false;
      for (const [id, t] of Object.entries(state)) {
        if (!t.endsAt) continue;
        if (Date.now() >= t.endsAt && !t.notified) {
          notify('OSRS Journal', `${t.label || id} is ready`);
          t.notified = true;
          changed = true;
        }
      }
      if (changed) saveState(state);
      if (document.getElementById('panel-timers')?.classList.contains('active')) {
        renderTimers();
      }
      // Stop interval if nothing active
      const anyActive = Object.values(state).some((t) => t.endsAt && Date.now() < t.endsAt);
      if (!anyActive && tickHandle) {
        clearInterval(tickHandle);
        tickHandle = null;
      }
    }, 1000);
  }

  window.renderTimers = function renderTimers() {
    const root = document.getElementById('timersRoot');
    if (!root) return;
    const state = loadState();
    const presets = typeof TIMER_PRESETS !== 'undefined' ? TIMER_PRESETS : [];
    const resets = typeof RESET_ACTIVITIES !== 'undefined' ? RESET_ACTIVITIES : [];
    const notifOk = typeof Notification !== 'undefined' && Notification.permission === 'granted';

    const activeCards = presets.map((p) => {
      const t = state[p.id];
      const remaining = t?.endsAt ? t.endsAt - Date.now() : null;
      const ready = remaining != null && remaining <= 0;
      const running = remaining != null && remaining > 0;
      return `
        <div class="timer-card${ready ? ' ready' : ''}${running ? ' running' : ''}">
          <div class="timer-icon">${p.icon || '⏱'}</div>
          <div class="timer-body">
            <div class="timer-title">${p.label}</div>
            <div class="timer-desc">${p.desc || ''}</div>
            <div class="timer-countdown">${running ? formatRemaining(remaining) : ready ? 'Ready — go collect' : p.mins + ' min cycle'}</div>
          </div>
          <div class="timer-actions">
            ${running
              ? `<button type="button" class="btn-ghost btn-xs" onclick="resetTimer('${p.id}')">Cancel</button>
                 <button type="button" class="btn-secondary btn-xs" onclick="restartTimer('${p.id}')">Restart</button>`
              : `<button type="button" class="btn-primary btn-xs" onclick="startTimer('${p.id}')">${ready ? 'Restart' : 'Start'}</button>
                 ${ready ? `<button type="button" class="btn-ghost btn-xs" onclick="resetTimer('${p.id}')">Clear</button>` : ''}`}
          </div>
        </div>`;
    }).join('');

    const resetCards = resets.map((r) => {
      const ends = r.period === 'weekly' ? nextUtcWednesday() : nextUtcMidnight();
      const remaining = ends - Date.now();
      return `
        <div class="timer-card reset">
          <div class="timer-body">
            <div class="timer-title">${r.label}</div>
            <div class="timer-desc">${r.desc || ''}</div>
            <div class="timer-countdown">Resets in ${formatRemaining(remaining)} <span class="muted">(${r.period} · UTC)</span></div>
          </div>
        </div>`;
    }).join('');

    root.innerHTML = `
      <div class="goal-intro">
        <h2>Activity timers</h2>
        <p>Start a countdown when you plant herbs or set birdhouses. Optional browser notifications when they finish. Dailies/weeklies use UTC reset times.</p>
      </div>
      <div class="timer-notif-bar">
        ${notifOk
          ? '<span class="hint" style="margin:0">Browser notifications are on.</span>'
          : `<button type="button" class="btn-secondary" onclick="requestTimerNotifications()">Enable notifications</button>
             <span class="hint" style="margin:0">Optional — ping when a timer finishes (even in another tab).</span>`}
      </div>
      <div class="section-title">Farming &amp; skilling</div>
      <div class="timer-grid">${activeCards}</div>
      <div class="section-title" style="margin-top:22px">Daily / weekly resets</div>
      <div class="timer-grid">${resetCards}</div>
    `;
    ensureTicking();
  };

  // Keep timers alive across tab switches
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const state = loadState();
      for (const [id, t] of Object.entries(state)) {
        if (t.endsAt && Date.now() >= t.endsAt && !t.notified) {
          notify('OSRS Journal', `${t.label || id} is ready`);
          t.notified = true;
        }
      }
      saveState(state);
    }
  });
})();
