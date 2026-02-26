(() => {
  const input = document.getElementById('subreddit-input');
  const addBtn = document.getElementById('add-btn');
  const listEl = document.getElementById('blocked-list');
  const emptyMsg = document.getElementById('empty-msg');

  let blocked = [];

  /* ── Storage helpers ──────────────────────── */
  function load(cb) {
    chrome.storage.sync.get({ blockedSubs: [] }, (data) => {
      blocked = data.blockedSubs;
      cb();
    });
  }

  function save(cb) {
    chrome.storage.sync.set({ blockedSubs: blocked }, () => {
      if (cb) cb();
    });
  }

  /* ── Render ────────────────────────────────── */
  function render() {
    listEl.innerHTML = '';

    if (blocked.length === 0) {
      emptyMsg.classList.remove('hidden');
      return;
    }

    emptyMsg.classList.add('hidden');

    blocked.forEach((sub) => {
      const chip = document.createElement('div');
      chip.className = 'chip';

      const prefix = document.createElement('span');
      prefix.className = 'chip-prefix';
      prefix.textContent = 'r/';

      const name = document.createElement('span');
      name.textContent = sub;

      const del = document.createElement('button');
      del.className = 'chip-delete';
      del.title = `Remove r/${sub}`;
      del.textContent = '×';
      del.addEventListener('click', () => removeSub(sub));

      chip.appendChild(prefix);
      chip.appendChild(name);
      chip.appendChild(del);
      listEl.appendChild(chip);
    });
  }

  /* ── Add / Remove ──────────────────────────── */
  function sanitize(raw) {
    // Strip leading "r/" or "/r/" and trim whitespace
    return raw
      .trim()
      .replace(/^\/?(r\/)?/i, '')
      .replace(/\/$/, '')
      .trim();
  }

  function addSub() {
    const name = sanitize(input.value);

    if (!name) return;

    if (blocked.includes(name)) {
      showToast(`r/${name} is already blocked`);
      input.value = '';
      input.focus();
      return;
    }

    blocked.push(name);
    blocked.sort();
    save(() => {
      render();
      input.value = '';
      input.focus();
      showToast(`r/${name} blocked`);
    });
  }

  function removeSub(name) {
    blocked = blocked.filter((s) => s !== name);
    save(() => {
      render();
      showToast(`r/${name} unblocked`);
    });
  }

  /* ── Toast ─────────────────────────────────── */
  let toastTimer;
  function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  /* ── Events ────────────────────────────────── */
  addBtn.addEventListener('click', addSub);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSub();
  });

  /* ── Init ──────────────────────────────────── */
  load(render);
})();
